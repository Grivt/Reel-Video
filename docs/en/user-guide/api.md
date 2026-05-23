# API Usage

Reel-Video provides a complete Python API for easy integration into your projects.

---

## Quick Start

```python
from reel_video.service import ReelVideoCore
import asyncio

async def main():
    # Initialize
    reel = ReelVideoCore()
    await reel.initialize()
    
    # Generate video
    result = await reel.generate_video(
        text="Why develop a reading habit",
        mode="generate",
        n_scenes=5
    )
    
    print(f"Video generated: {result.video_path}")

# Run
asyncio.run(main())
```

---

## API Reference

For detailed API documentation, see [API Overview](../reference/api-overview.md).

---

## Examples

For more usage examples, check the `examples/` directory in the project.

