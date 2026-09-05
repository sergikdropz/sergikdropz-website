# Local Ollama Models Configuration

This project is configured to use your local Ollama models in Cursor/Continue.

## Available Models

The following models are configured and ready to use:

### Coding Models (Recommended for Development)
- **Qwen2.5 Coder 7B** - Fast, efficient coding model (32K context)
- **Qwen3 Coder 30B** - More powerful coding model (32K context)
- **Qwen2.5 Coder 1.5B** - Lightweight coding model (32K context)
- **CodeGemma** - Google's coding model (8K context)

### Vision Model
- **LLaVA** - Multimodal model that can see images (4K context)

### Large Language Models
- **GPT-OSS 20B** - General purpose (4K context)
- **GPT-OSS 120B** - Very large model (4K context)
- **GPT-OSS 120B Cloud** - Cloud-hosted version
- **DeepSeek v3.1 Cloud** - Cloud-hosted model

## How to Use

1. **Open Continue Chat**: Press `Cmd+L` (Mac) or `Ctrl+L` (Windows/Linux)
2. **Select a Model**: Click the model selector dropdown at the top of the chat
3. **Choose Your Model**: Select from the list of available Ollama models

## Recommended Models by Task

- **General Coding**: Qwen2.5 Coder 7B (fast and efficient)
- **Complex Code**: Qwen3 Coder 30B (more capable)
- **Quick Tasks**: Qwen2.5 Coder 1.5B (lightweight)
- **Image Analysis**: LLaVA (if you need vision capabilities)
- **Large Context**: Qwen3 Coder 30B (32K context window)

## Configuration Files

- **`.continue/config.yaml`** - Local model configuration (project-specific)
- **`~/.continue/config.yaml`** - Global model configuration (system-wide)

The local config takes precedence over the global config for this project.

## Troubleshooting

If models don't appear:
1. Ensure Ollama is running: `ollama list`
2. Verify the daemon is accessible: `curl http://localhost:11434/api/tags`
3. Restart Cursor/VS Code
4. Check that models are downloaded: `ollama list`

## Default Model

To set a default model, uncomment and modify the `defaultModel` line in `.continue/config.yaml`:

```yaml
defaultModel: "Qwen2.5 Coder 7B"
```
