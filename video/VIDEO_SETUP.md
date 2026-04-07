# VIDEO PIPELINE — CLAUDE.md ADDITION
# Paste this section into your existing CLAUDE.md

---

## VIDEO PIPELINE

### Generation tools
- ComfyUI API: http://YOUR_IP:8188/prompt (submit workflow JSON)
- Wan2.2 models: wan2.2_t2v_5B_fp16.safetensors (5B, 720P)
- Video output dir: ./comfyui-output/
- Storage: MinIO at http://YOUR_IP:9001

### Analysis tools
- Video Analyzer API: http://YOUR_IP:8500/analyze
- Whisper ASR: http://YOUR_IP:9000/asr
- Qdrant semantic search: http://YOUR_IP:6333

### Trigger phrases for video work

VIDEO-GEN: [brief description]
  → Claude writes optimized Wan2.2 prompt
  → Calls n8n workflow 07 to generate
  → Monitors for completion
  → Logs to AFFiNE with settings used

VIDEO-ANALYZE: [file path or URL]
  → Calls n8n workflow 08
  → Transcribes + scene detects + frame extracts
  → Claude synthesizes analysis
  → Indexes to SurfSense + AFFiNE + Qdrant

VIDEO-PROMPT: [reference video path]
  → POST to video-analyzer /generate-prompt
  → Returns optimized T2V/I2V prompt + settings

VIDEO-SEARCH: [natural language query]
  → Searches Qdrant for semantically similar videos
  → Returns matching video analyses from SurfSense

### ComfyUI workflow format reminder
When building ComfyUI prompts programmatically, the API format is:
POST /prompt with body:
{
  "prompt": {
    "node_id": {"class_type": "NodeName", "inputs": {...}},
    ...
  }
}
Poll /history/{prompt_id} until outputs appear.
Retrieve file via /view?filename=X&type=output

---

# ============================================================
# WAN2.2 MODEL DOWNLOAD GUIDE
# ============================================================
# Run these commands on the host machine (not in Docker)
# Models must be placed in ./comfyui-models/diffusion_models/

# Create model directories
mkdir -p comfyui-models/diffusion_models
mkdir -p comfyui-models/text_encoders
mkdir -p comfyui-models/vae
mkdir -p comfyui-models/clip_vision

# Install huggingface-cli
pip install huggingface_hub

# Download Wan2.2 T2V 5B (720P, consumer GPU friendly)
huggingface-cli download Wan-AI/Wan2.2-TI2V-5B \
  --include "*.safetensors" \
  --local-dir comfyui-models/diffusion_models/

# Download text encoder (required)
huggingface-cli download Comfy-Org/mochi_preview_repackaged \
  --include "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors" \
  --local-dir comfyui-models/text_encoders/

# Download VAE (required)
huggingface-cli download Wan-AI/Wan2.2-TI2V-5B \
  --include "Wan_VAE_fp32.safetensors" \
  --local-dir comfyui-models/vae/

# Download CLIP vision (required for I2V)
huggingface-cli download openai/clip-vit-large-patch14 \
  --include "*.safetensors" \
  --local-dir comfyui-models/clip_vision/

# ============================================================
# HARDWARE REQUIREMENTS
# ============================================================
# Wan2.2 5B (720P):   8GB VRAM minimum, 12GB recommended
# Wan2.2 14B (720P):  16GB VRAM minimum (A4000, 3090, 4090)
# Whisper medium:     4GB VRAM
# YOLO v11:           2GB VRAM
# Total recommended:  24GB VRAM (e.g. 2x 12GB or 1x 24GB)
#
# CPU fallback: All services work on CPU but are 10-50x slower.
# For CPU-only, remove the 'deploy: resources:' sections from
# docker-compose.video.yml

# ============================================================
# INSTALL COMFYUI CUSTOM NODES (run once after ComfyUI starts)
# ============================================================
# ComfyUI Manager for easy node installation:
# 1. Open http://YOUR_IP:8188
# 2. Click "Manager" in top right
# 3. Install these nodes:
#    - ComfyUI-VideoHelperSuite (VHS nodes for video I/O)
#    - ComfyUI-WanVideoWrapper (optimized Wan2.x support)
#
# Or via CLI inside the ComfyUI container:
# docker exec -it comfyui bash
# cd /root/ComfyUI/custom_nodes
# git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite
# git clone https://github.com/kijai/ComfyUI-WanVideoWrapper
# pip install -r ComfyUI-VideoHelperSuite/requirements.txt
# pip install -r ComfyUI-WanVideoWrapper/requirements.txt
