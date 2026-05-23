# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Task Manager

Task management for video generation jobs.

Tasks are persisted to a single JSON file (`output/.tasks.json`) so that history
survives sidecar restarts. Terminal-state transitions trigger a flush; progress
updates stay in memory only (would otherwise thrash the disk).
"""

import asyncio
import json
import shutil
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Callable
from loguru import logger

from api.tasks.models import Task, TaskStatus, TaskType, TaskProgress
from api.config import api_config

DEFAULT_PERSIST_PATH = Path("output") / ".tasks.json"


class TaskManager:
    """
    Task manager for handling async video generation tasks
    
    Features:
    - In-memory storage (can be replaced with Redis later)
    - Task lifecycle management
    - Progress tracking
    - Auto cleanup of old tasks
    """
    
    def __init__(self, persist_path: Optional[Path] = None):
        self._tasks: Dict[str, Task] = {}
        self._task_futures: Dict[str, asyncio.Task] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = False
        self._persist_path = persist_path or DEFAULT_PERSIST_PATH

    def _load_from_disk(self):
        """Load persisted tasks from JSON file (if any)."""
        try:
            if not self._persist_path.exists():
                return
            with open(self._persist_path, "r", encoding="utf-8") as f:
                raw = json.load(f) or []
            loaded = 0
            for entry in raw:
                try:
                    task = Task.model_validate(entry)
                except Exception as e:
                    logger.warning(f"Skipping malformed task entry: {e}")
                    continue
                # Tasks that were running when the sidecar died are orphaned;
                # mark them as failed so the UI doesn't show a stuck spinner.
                if task.status in (TaskStatus.PENDING, TaskStatus.RUNNING):
                    task.status = TaskStatus.FAILED
                    task.error = (task.error or "") + "[orphaned: sidecar restarted before completion]"
                    if not task.completed_at:
                        task.completed_at = datetime.now()
                self._tasks[task.task_id] = task
                loaded += 1
            logger.info(f"📂 Loaded {loaded} task(s) from {self._persist_path}")
        except Exception as e:
            logger.warning(f"Failed to load persisted tasks: {e}")

    def _save_to_disk(self):
        """Atomically write the current task table to disk."""
        try:
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._persist_path.with_suffix(self._persist_path.suffix + ".tmp")
            # Sort by creation time so reload preserves insertion order roughly.
            ordered = sorted(self._tasks.values(), key=lambda t: t.created_at)
            data = [json.loads(t.model_dump_json()) for t in ordered]
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            tmp.replace(self._persist_path)
        except Exception as e:
            logger.warning(f"Failed to persist tasks: {e}")

    async def start(self):
        """Start task manager and cleanup scheduler"""
        if self._running:
            logger.warning("Task manager already running")
            return

        self._running = True
        self._load_from_disk()
        # Persist once after load so orphaned->failed transitions are written.
        if self._tasks:
            self._save_to_disk()
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("✅ Task manager started")

    async def stop(self):
        """Stop task manager and cancel all tasks"""
        self._running = False

        # Cancel cleanup task
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        # Cancel all running tasks
        for task_id, future in self._task_futures.items():
            if not future.done():
                future.cancel()
                logger.info(f"Cancelled task: {task_id}")

        # Don't clear _tasks — they're already persisted; keeping them in memory
        # lets list_tasks() still work if stop() is called mid-process.
        self._task_futures.clear()
        logger.info("✅ Task manager stopped")
    
    def create_task(
        self,
        task_type: TaskType,
        request_params: Optional[dict] = None
    ) -> Task:
        """
        Create a new task
        
        Args:
            task_type: Type of task
            request_params: Original request parameters
            
        Returns:
            Created task
        """
        task_id = str(uuid.uuid4())
        task = Task(
            task_id=task_id,
            task_type=task_type,
            status=TaskStatus.PENDING,
            request_params=request_params,
        )
        
        self._tasks[task_id] = task
        logger.info(f"Created task {task_id} ({task_type})")
        self._save_to_disk()
        return task
    
    async def execute_task(
        self,
        task_id: str,
        coro_func: Callable,
        *args,
        **kwargs
    ):
        """
        Execute task asynchronously
        
        Args:
            task_id: Task ID
            coro_func: Async function to execute
            *args: Positional arguments
            **kwargs: Keyword arguments
        """
        task = self._tasks.get(task_id)
        if not task:
            logger.error(f"Task {task_id} not found")
            return
        
        # Create async task
        async def _execute():
            try:
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.now()
                logger.info(f"Task {task_id} started")
                self._save_to_disk()

                # Execute the actual work
                result = await coro_func(*args, **kwargs)

                # Update task with result
                task.status = TaskStatus.COMPLETED
                task.result = result
                task.completed_at = datetime.now()
                logger.info(f"Task {task_id} completed")

            except Exception as e:
                task.status = TaskStatus.FAILED
                task.error = str(e)
                task.completed_at = datetime.now()
                logger.error(f"Task {task_id} failed: {e}")
            finally:
                self._save_to_disk()
        
        # Start execution
        future = asyncio.create_task(_execute())
        self._task_futures[task_id] = future
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """Get task by ID"""
        return self._tasks.get(task_id)
    
    def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        limit: int = 100
    ) -> List[Task]:
        """
        List tasks with optional filtering
        
        Args:
            status: Filter by status
            limit: Maximum number of tasks to return
            
        Returns:
            List of tasks
        """
        tasks = list(self._tasks.values())
        
        if status:
            tasks = [t for t in tasks if t.status == status]
        
        # Sort by created_at descending
        tasks.sort(key=lambda t: t.created_at, reverse=True)
        
        return tasks[:limit]
    
    def update_progress(
        self,
        task_id: str,
        current: int,
        total: int,
        message: str = ""
    ):
        """
        Update task progress
        
        Args:
            task_id: Task ID
            current: Current progress
            total: Total steps
            message: Progress message
        """
        task = self._tasks.get(task_id)
        if not task:
            return
        
        percentage = (current / total * 100) if total > 0 else 0
        task.progress = TaskProgress(
            current=current,
            total=total,
            percentage=percentage,
            message=message
        )
    
    def cancel_task(self, task_id: str) -> bool:
        """
        Cancel a running task
        
        Args:
            task_id: Task ID
            
        Returns:
            True if cancelled, False otherwise
        """
        task = self._tasks.get(task_id)
        if not task:
            return False
        
        # Do not cancel already-terminal tasks
        if task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
            return False

        # Cancel future if running
        future = self._task_futures.get(task_id)
        if future and not future.done():
            future.cancel()
        
        # Update task status
        task.status = TaskStatus.CANCELLED
        task.completed_at = datetime.now()
        logger.info(f"Cancelled task {task_id}")
        self._save_to_disk()
        return True

    def delete_task(self, task_id: str, purge_files: bool = True) -> bool:
        """
        Permanently delete a task record. Optionally nukes the on-disk output
        directory (frames, audio, final.mp4) referenced by the task result.

        Args:
            task_id: Task ID
            purge_files: If True, recursively delete the task's output dir.

        Returns:
            True if removed, False if not found.
        """
        task = self._tasks.get(task_id)
        if not task:
            return False

        # Cancel running future first so the worker doesn't keep writing.
        future = self._task_futures.pop(task_id, None)
        if future and not future.done():
            future.cancel()

        # Best-effort filesystem cleanup. The result dict is shaped by
        # api/routers/video.py:execute_video_generation and carries `output_dir`.
        if purge_files and isinstance(task.result, dict):
            out_dir = task.result.get("output_dir")
            if out_dir:
                try:
                    p = Path(out_dir)
                    if p.exists() and p.is_dir():
                        shutil.rmtree(p)
                        logger.info(f"🗑️  Removed output dir {p}")
                except Exception as e:
                    logger.warning(f"Could not remove {out_dir}: {e}")

        self._tasks.pop(task_id, None)
        self._save_to_disk()
        logger.info(f"Deleted task {task_id}")
        return True
    
    async def _cleanup_loop(self):
        """Periodically clean up old completed tasks"""
        while self._running:
            try:
                await asyncio.sleep(api_config.task_cleanup_interval)
                self._cleanup_old_tasks()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")
    
    def _cleanup_old_tasks(self):
        """Remove old completed/failed tasks"""
        cutoff_time = datetime.now() - timedelta(seconds=api_config.task_retention_time)
        
        tasks_to_remove = []
        for task_id, task in self._tasks.items():
            if task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                if task.completed_at and task.completed_at < cutoff_time:
                    tasks_to_remove.append(task_id)
        
        for task_id in tasks_to_remove:
            del self._tasks[task_id]
            if task_id in self._task_futures:
                del self._task_futures[task_id]
        
        if tasks_to_remove:
            logger.info(f"Cleaned up {len(tasks_to_remove)} old tasks")
            self._save_to_disk()


# Global task manager instance
task_manager = TaskManager()

