# SERGIK Project Reorganization Plan

**Date:** February 6, 2026  
**Purpose:** Audit current folder structure and propose a clean reorganization

---

## Executive Summary

The project root currently contains **60+ markdown documents**, **15+ shell scripts**, **5+ utility scripts**, and various config files scattered at the root level. This creates organizational debt and makes navigation difficult.

This plan proposes a clean structure that:
- Keeps essential config files at root
- Moves all documentation into a logical `docs/` hierarchy
- Consolidates shell scripts into `scripts/`
- Organizes web-specific markdown into `web/docs/`
- Preserves existing well-organized directories

---

## Current State Analysis

### Root-Level Files Count
| Category | Count |
|----------|-------|
| Markdown (.md) | ~50+ |
| Shell scripts (.sh) | ~15+ |
| JavaScript utilities (.js, .mjs) | ~5+ |
| Text files (.txt) | ~5 |
| Config files | ~6 |
| Total non-hidden files | ~80+ |

### Existing Directories (Already Well-Organized)
- `web/` - Next.js application
- `mobile/` - Mobile app data
- `data/` - Schemas, templates, mappings
- `scripts/` - ETL/build scripts (Python/Node)
- `kb/` - Knowledge base documentation
- `analysis/` - Architecture and dataset audits
- `cursor-provider-bridge/` - VSCode extension

---

## Proposed Folder Structure

```
SERGIK Web and app/
├── .claude/                    # Claude AI config
├── .continue/                  # Continue AI config
├── .cursor/                    # Cursor AI config
├── .vscode/                    # VSCode settings
├── analysis/                   # (exists) Architecture audits
├── cursor-provider-bridge/      # (exists) VSCode extension
├── data/                       # (exists) Schemas, templates, mappings
├── docs/                       # NEW: Root-level project documentation
│   ├── deployment/             # Deployment guides
│   ├── database/               # Database/Supabase guides
│   ├── docker/                 # Docker guides
│   ├── phases/                 # Phase documentation
│   ├── gallery/                # Gallery/image guides
│   ├── integrations/           # External integrations
│   └── project/                # General project docs
├── kb/                         # (exists) Knowledge base
├── mobile/                     # (exists) Mobile app data
├── scripts/                    # NEW: Consolidated shell scripts
│   ├── images/                 # Image management scripts
│   ├── deployment/             # Deployment scripts
│   ├── utilities/              # General utility scripts
├── web/                        # (exists) Next.js application
│   ├── app/                    # Next.js App Router
│   ├── components/             # React components
│   ├── docs/                   # NEW: Web-specific documentation
│   │   ├── admin/             # Admin dashboard docs
│   │   ├── integrations/      # Integration guides
│   │   ├── database/          # Database guides
│   │   └── reference/         # API/architecture reference
│   ├── public/                 # Static assets
│   └── ...
├── .dockerignore
├── .gitignore
├── .vercelignore
├── AGENTS.md                   # (keep at root - per requirements)
├── docker-compose.yml
├── Makefile
├── package.json
├── requirements.txt
├── README.md                   # (keep at root - per requirements)
└── vercel.json
```

---

## File Move Mappings

### Essential Config Files (STAY AT ROOT)

| File | Action | Notes |
|------|--------|-------|
| `.dockerignore` | KEEP | Docker configuration |
| `.gitignore` | KEEP | Git ignore rules |
| `.vercelignore` | KEEP | Vercel ignore rules |
| `AGENTS.md` | KEEP | Agent instructions (required) |
| `docker-compose.yml` | KEEP | Docker Compose config |
| `Makefile` | KEEP | Docker commands |
| `package.json` | KEEP | Root npm for ETL validators |
| `requirements.txt` | KEEP | Python requirements |
| `vercel.json` | KEEP | Vercel configuration |
| `README.md` | KEEP | Main README (required) |

---

### Markdown Files: Move to `docs/`

#### Project Documentation (`docs/project/`)

| From | To |
|------|-----|
| `QUICKSTART.md` | `docs/project/QUICKSTART.md` |
| `DEV_ENTRY.md` | `docs/project/DEV_ENTRY.md` |
| `README_ETL.md` | `docs/project/README_ETL.md` |
| `DATASET_SCAFFOLD.md` | `docs/project/DATASET_SCAFFOLD.md` |
| `LEARNING_FROM_INTELLIJEND.md` | `docs/project/LEARNING_FROM_INTELLIJEND.md` |
| `INTELLIJEND_AUDIT_COMPLETE.md` | `docs/project/INTELLIJEND_AUDIT_COMPLETE.md` |
| `SERGIKDROPZ_ALL_LINKS.md` | `docs/project/SERGIKDROPZ_ALL_LINKS.md` |
| `READY_TO_USE.md` | `docs/project/READY_TO_USE.md` |
| `AUTOMATED_SETUP_STATUS.md` | `docs/project/AUTOMATED_SETUP_STATUS.md` |
| `BUILD_STATUS_JAN29.md` | `docs/project/BUILD_STATUS_JAN29.md` |

#### Deployment Guides (`docs/deployment/`)

| From | To |
|------|-----|
| `DEPLOY_NOW.md` | `docs/deployment/DEPLOY_NOW.md` |
| `DEPLOYMENT_GUIDE.md` | `docs/deployment/DEPLOYMENT_GUIDE.md` |
| `DOMAIN_UPDATE_GUIDE.md` | `docs/deployment/DOMAIN_UPDATE_GUIDE.md` |
| `FIX_ROOT_DIRECTORY.md` | `docs/deployment/FIX_ROOT_DIRECTORY.md` |
| `fix-vercel-deployment.md` | `docs/deployment/fix-vercel-deployment.md` |
| `update-root-instructions.md` | `docs/deployment/update-root-instructions.md` |

#### Database/Supabase (`docs/database/`)

| From | To |
|------|-----|
| `DATABASE_OPTIMIZATION_FINAL_SUMMARY.md` | `docs/database/DATABASE_OPTIMIZATION_FINAL_SUMMARY.md` |
| `DATABASE_OPTIMIZATIONS_APPLIED.md` | `docs/database/DATABASE_OPTIMIZATIONS_APPLIED.md` |
| `DATABASE_PERFORMANCE_ANALYSIS.md` | `docs/database/DATABASE_PERFORMANCE_ANALYSIS.md` |
| `DATABASE_PERFORMANCE_SUMMARY.md` | `docs/database/DATABASE_PERFORMANCE_SUMMARY.md` |
| `SUPABASE_FIX_GUIDE.md` | `docs/database/SUPABASE_FIX_GUIDE.md` |
| `SUPABASE_FIX_SUMMARY.md` | `docs/database/SUPABASE_FIX_SUMMARY.md` |
| `SUPABASE_FIXED_CONFIRMED.md` | `docs/database/SUPABASE_FIXED_CONFIRMED.md` |
| `SUPABASE_INTEGRATION_SUMMARY.md` | `docs/database/SUPABASE_INTEGRATION_SUMMARY.md` |
| `SUPABASE_URGENT_FIX.md` | `docs/database/SUPABASE_URGENT_FIX.md` |

#### Docker (`docs/docker/`)

| From | To |
|------|-----|
| `DOCKER_GUIDE.md` | `docs/docker/DOCKER_GUIDE.md` |
| `DOCKER_QUICKSTART.md` | `docs/docker/DOCKER_QUICKSTART.md` |

#### Phase Documentation (`docs/phases/`)

| From | To |
|------|-----|
| `PHASE_1_EXECUTIVE_SUMMARY.md` | `docs/phases/PHASE_1_EXECUTIVE_SUMMARY.md` |
| `PHASE_1_IMPLEMENTATION_GUIDE.md` | `docs/phases/PHASE_1_IMPLEMENTATION_GUIDE.md` |
| `PHASE_1_TEST_CHECKLIST.md` | `docs/phases/PHASE_1_TEST_CHECKLIST.md` |
| `IMPROVEMENTS_PLAN.md` | `docs/phases/IMPROVEMENTS_PLAN.md` |
| `QUICK_IMPROVEMENTS.md` | `docs/phases/QUICK_IMPROVEMENTS.md` |
| `MIGRATION_COMPLETE.md` | `docs/phases/MIGRATION_COMPLETE.md` |
| `MIGRATION_GUIDE.md` | `docs/phases/MIGRATION_GUIDE.md` |

#### Gallery/Images (`docs/gallery/`)

| From | To |
|------|-----|
| `ADD_IMAGES_GUIDE.md` | `docs/gallery/ADD_IMAGES_GUIDE.md` |
| `GALLERY_MATCHING_COMPLETE.md` | `docs/gallery/GALLERY_MATCHING_COMPLETE.md` |
| `GALLERY_RESCAN_REPORT.md` | `docs/gallery/GALLERY_RESCAN_REPORT.md` |
| `GALLERY_UPDATE_COMPLETE.md` | `docs/gallery/GALLERY_UPDATE_COMPLETE.md` |
| `GALLERY_UPDATE_STATUS.md` | `docs/gallery/GALLERY_UPDATE_STATUS.md` |
| `IMAGE_MAPPING.md` | `docs/gallery/IMAGE_MAPPING.md` |
| `IMAGE_MATCHING_GUIDE.md` | `docs/gallery/IMAGE_MATCHING_GUIDE.md` |
| `IMAGE_STATUS.md` | `docs/gallery/IMAGE_STATUS.md` |

---

### Shell Scripts: Move to `scripts/`

#### Image Management (`scripts/images/`)

| From | To |
|------|-----|
| `add-images.sh` | `scripts/images/add-images.sh` |
| `auto-review-images.sh` | `scripts/images/auto-review-images.sh` |
| `create-preliminary-mapping.sh` | `scripts/images/create-preliminary-mapping.sh` |
| `match-gallery-images.sh` | `scripts/images/match-gallery-images.sh` |
| `organize-images.sh` | `scripts/images/organize-images.sh` |
| `organize-new-gallery-images.sh` | `scripts/images/organize-new-gallery-images.sh` |
| `rename-gallery-images.sh` | `scripts/images/rename-gallery-images.sh` |
| `rename-remaining-images.sh` | `scripts/images/rename-remaining-images.sh` |
| `rescan-detailed.sh` | `scripts/images/rescan-detailed.sh` |
| `rescan-gallery-images.sh` | `scripts/images/rescan-gallery-images.sh` |

#### Deployment (`scripts/deployment/`)

| From | To |
|------|-----|
| `docker-start.sh` | `scripts/deployment/docker-start.sh` |
| `create-dock-app.sh` | `scripts/deployment/create-dock-app.sh` |
| `dock-folder.sh` | `scripts/deployment/dock-folder.sh` |

---

### Utility Scripts (`scripts/utilities/`)

| From | To |
|------|-----|
| `fix-root-directory.js` | `scripts/utilities/fix-root-directory.js` |
| `update-root-api.js` | `scripts/utilities/update-root-api.js` |
| `update-root-directory.mjs` | `scripts/utilities/update-root-directory.mjs` |
| `update-vercel-root.js` | `scripts/utilities/update-vercel-root.js` |
| `use_local_model.py` | `scripts/utilities/use_local_model.py` |

---

### Text Files (`docs/text/`)

| From | To |
|------|-----|
| `QUICK_START.txt` | `docs/text/QUICK_START.txt` |
| `PHASE_1_READY.txt` | `docs/text/PHASE_1_READY.txt` |

---

### Root Move Scripts to `scripts/migration/`

| From | To |
|------|-----|
| `update-root-instructions.md` | `docs/deployment/update-root-instructions.md` |

---

## Web Directory Markdown Files

The `web/` directory contains **~200+ markdown files**. Here's the proposed reorganization:

### Existing `web/docs/` (Keep + Expand)

| From | To |
|------|-----|
| `web/docs/TRACK_UPLOAD_PIPELINE.md` | `web/docs/reference/TRACK_UPLOAD_PIPELINE.md` |
| `web/docs/WAVEFORM_RENDERING_MODEL.md` | `web/docs/reference/WAVEFORM_RENDERING_MODEL.md` |

#### Admin Dashboard (`web/docs/admin/`)

| From | To |
|------|-----|
| `web/ADMIN_DASHBOARD_COMPLETE.md` | `web/docs/admin/ADMIN_DASHBOARD_COMPLETE.md` |
| `web/ADMIN_DASHBOARD_ENHANCEMENTS.md` | `web/docs/admin/ADMIN_DASHBOARD_ENHANCEMENTS.md` |
| `web/ADMIN_MUSIC_LIBRARY_GUIDE.md` | `web/docs/admin/ADMIN_MUSIC_LIBRARY_GUIDE.md` |
| `web/ADMIN_QUICK_START.md` | `web/docs/admin/ADMIN_QUICK_START.md` |
| `web/ADMIN_SETUP_GUIDE.md` | `web/docs/admin/ADMIN_SETUP_GUIDE.md` |
| `web/DO_THIS_NOW.md` | `web/docs/admin/DO_THIS_NOW.md` |
| `web/MUSIC_ADMIN_ENHANCEMENTS.md` | `web/docs/admin/MUSIC_ADMIN_ENHANCEMENTS.md` |
| `web/MUSIC_LIBRARY_ADMIN_COMPLETE.md` | `web/docs/admin/MUSIC_LIBRARY_ADMIN_COMPLETE.md` |
| `web/MUSIC_LIBRARY_BACKEND_COMPLETE.md` | `web/docs/admin/MUSIC_LIBRARY_BACKEND_COMPLETE.md` |
| `web/MUSIC_LIBRARY_BACKEND_SETUP.md` | `web/docs/admin/MUSIC_LIBRARY_BACKEND_SETUP.md` |
| `web/MUSIC_LIBRARY_GUIDE.md` | `web/docs/admin/MUSIC_LIBRARY_GUIDE.md` |
| `web/MUSIC_LIBRARY_QUICKSTART.md` | `web/docs/admin/MUSIC_LIBRARY_QUICKSTART.md` |
| `web/MUSIC_PLAYER_ENHANCEMENTS.md` | `web/docs/admin/MUSIC_PLAYER_ENHANCEMENTS.md` |
| `web/PRO_PLAN_SETUP.md` | `web/docs/admin/PRO_PLAN_SETUP.md` |
| `web/STUDIO_QUICKSTART.md` | `web/docs/admin/STUDIO_QUICKSTART.md` |

#### Instagram Integration (`web/docs/instagram/`)

| From | To |
|------|-----|
| `web/ADD_INSTAGRAM_POSTS.md` | `web/docs/instagram/ADD_INSTAGRAM_POSTS.md` |
| `web/FIND_INSTAGRAM_BUSINESS_ACCOUNT_ID.md` | `web/docs/instagram/FIND_INSTAGRAM_BUSINESS_ACCOUNT_ID.md` |
| `web/GET_INSTAGRAM_USER_ID.md` | `web/docs/instagram/GET_INSTAGRAM_USER_ID.md` |
| `web/GET_REMAINING_KEYS.md` | `web/docs/instagram/GET_REMAINING_KEYS.md` |
| `web/HOW_TO_GET_INSTAGRAM_TOKEN.md` | `web/docs/instagram/HOW_TO_GET_INSTAGRAM_TOKEN.md` |
| `web/INSTAGRAM_API_DEPRECATED.md` | `web/docs/instagram/INSTAGRAM_API_DEPRECATED.md` |
| `web/INSTAGRAM_API_ENDPOINTS_FIX.md` | `web/docs/instagram/INSTAGRAM_API_ENDPOINTS_FIX.md` |
| `web/INSTAGRAM_API_QUICKSTART.md` | `web/docs/instagram/INSTAGRAM_API_QUICKSTART.md` |
| `web/INSTAGRAM_API_SETUP_READY.md` | `web/docs/instagram/INSTAGRAM_API_SETUP_READY.md` |
| `web/INSTAGRAM_API_SETUP_WALKTHROUGH.md` | `web/docs/instagram/INSTAGRAM_API_SETUP_WALKTHROUGH.md` |
| `web/INSTAGRAM_AUTO_FETCH_COMPLETE.md` | `web/docs/instagram/INSTAGRAM_AUTO_FETCH_COMPLETE.md` |
| `web/INSTAGRAM_AUTO_FETCH_QUICKSTART.md` | `web/docs/instagram/INSTAGRAM_AUTO_FETCH_QUICKSTART.md` |
| `web/INSTAGRAM_AUTO_FETCH_SETUP.md` | `web/docs/instagram/INSTAGRAM_AUTO_FETCH_SETUP.md` |
| `web/INSTAGRAM_AUTOMATED_PIPELINE.md` | `web/docs/instagram/INSTAGRAM_AUTOMATED_PIPELINE.md` |
| `web/INSTAGRAM_COLLABORATION_LIMITATION.md` | `web/docs/instagram/INSTAGRAM_COLLABORATION_LIMITATION.md` |
| `web/INSTAGRAM_COLLABORATION_POSTS.md` | `web/docs/instagram/INSTAGRAM_COLLABORATION_POSTS.md` |
| `web/INSTAGRAM_ERROR_FIX.md` | `web/docs/instagram/INSTAGRAM_ERROR_FIX.md` |
| `web/INSTAGRAM_FINAL_SOLUTION.md` | `web/docs/instagram/INSTAGRAM_FINAL_SOLUTION.md` |
| `web/INSTAGRAM_GRAPH_API_CORRECT_USAGE.md` | `web/docs/instagram/INSTAGRAM_GRAPH_API_CORRECT_USAGE.md` |
| `web/INSTAGRAM_GRAPH_API_MIGRATION.md` | `web/docs/instagram/INSTAGRAM_GRAPH_API_MIGRATION.md` |
| `web/INSTAGRAM_HELPER_WORKFLOW.md` | `web/docs/instagram/INSTAGRAM_HELPER_WORKFLOW.md` |
| `web/INSTAGRAM_LOGIN_UPDATE.md` | `web/docs/instagram/INSTAGRAM_LOGIN_UPDATE.md` |
| `web/INSTAGRAM_MEDIA_SCRAPING.md` | `web/docs/instagram/INSTAGRAM_MEDIA_SCRAPING.md` |
| `web/INSTAGRAM_MIGRATION_COMPLETE.md` | `web/docs/instagram/INSTAGRAM_MIGRATION_COMPLETE.md` |
| `web/INSTAGRAM_NO_API_SOLUTION.md` | `web/docs/instagram/INSTAGRAM_NO_API_SOLUTION.md` |
| `web/INSTAGRAM_OAUTH_SETUP.md` | `web/docs/instagram/INSTAGRAM_OAUTH_SETUP.md` |
| `web/INSTAGRAM_QUICK_START.md` | `web/docs/instagram/INSTAGRAM_QUICK_START.md` |
| `web/INSTAGRAM_READY.md` | `web/docs/instagram/INSTAGRAM_READY.md` |
| `web/INSTAGRAM_SETUP_COMPLETE.md` | `web/docs/instagram/INSTAGRAM_SETUP_COMPLETE.md` |
| `web/INSTAGRAM_SETUP_FINAL.md` | `web/docs/instagram/INSTAGRAM_SETUP_FINAL.md` |
| `web/INSTAGRAM_SETUP_GUIDE.md` | `web/docs/instagram/INSTAGRAM_SETUP_GUIDE.md` |
| `web/INSTAGRAM_SETUP_MANUAL_GUIDE.md` | `web/docs/instagram/INSTAGRAM_SETUP_MANUAL_GUIDE.md` |
| `web/INSTAGRAM_SETUP_STATUS.md` | `web/docs/instagram/INSTAGRAM_SETUP_STATUS.md` |
| `web/INSTAGRAM_SETUP_STEP_BY_STEP.md` | `web/docs/instagram/INSTAGRAM_SETUP_STEP_BY_STEP.md` |
| `web/INSTAGRAM_TABLE_SETUP.md` | `web/docs/instagram/INSTAGRAM_TABLE_SETUP.md` |
| `web/INSTAGRAM_TOKEN_FIX.md` | `web/docs/instagram/INSTAGRAM_TOKEN_FIX.md` |
| `web/INSTAGRAM_VIDEO_ACCESS_GUIDE.md` | `web/docs/instagram/INSTAGRAM_VIDEO_ACCESS_GUIDE.md` |
| `web/INSTAGRAM_VIDEO_DOWNLOAD_GUIDE.md` | `web/docs/instagram/INSTAGRAM_VIDEO_DOWNLOAD_GUIDE.md` |
| `web/INSTAGRAM_VIDEO_ERROR_FIX.md` | `web/docs/instagram/INSTAGRAM_VIDEO_ERROR_FIX.md` |
| `web/INSTAGRAM_VIDEO_IMPLEMENTATION_COMPLETE.md` | `web/docs/instagram/INSTAGRAM_VIDEO_IMPLEMENTATION_COMPLETE.md` |
| `web/INSTAGRAM_VIDEO_SETUP_NEEDED.md` | `web/docs/instagram/INSTAGRAM_VIDEO_SETUP_NEEDED.md` |
| `web/INSTAGRAM_VIDEO_STATUS.md` | `web/docs/instagram/INSTAGRAM_VIDEO_STATUS.md` |
| `web/QUICK_START_INSTAGRAM.md` | `web/docs/instagram/QUICK_START_INSTAGRAM.md` |

#### Agent Pipeline (`web/docs/agents/`)

| From | To |
|------|-----|
| `web/AGENT_PIPELINE_GUIDE.md` | `web/docs/agents/AGENT_PIPELINE_GUIDE.md` |
| `web/AGENT_PIPELINE_QUICKSTART.md` | `web/docs/agents/AGENT_PIPELINE_QUICKSTART.md` |
| `web/AGENT_PIPELINE_SUMMARY.md` | `web/docs/agents/AGENT_PIPELINE_SUMMARY.md` |
| `web/AGENT_TEAM_FORTIFIED.md` | `web/docs/agents/AGENT_TEAM_FORTIFIED.md` |
| `web/COMPLETE_AGENT_TEAM.md` | `web/docs/agents/COMPLETE_AGENT_TEAM.md` |
| `web/AI_API_KEYS.md` | `web/docs/agents/AI_API_KEYS.md` |

#### Database (`web/docs/database/`)

| From | To |
|------|-----|
| `web/DATABASE_EXPORT_COMPLETE.md` | `web/docs/database/DATABASE_EXPORT_COMPLETE.md` |
| `web/DUPLICATE_CLEANUP_COMPLETE.md` | `web/docs/database/DUPLICATE_CLEANUP_COMPLETE.md` |
| `web/DUPLICATE_PREVENTION.md` | `web/docs/database/DUPLICATE_PREVENTION.md` |
| `web/LOCAL_DATABASE_GUIDE.md` | `web/docs/database/LOCAL_DATABASE_GUIDE.md` |
| `web/RUN_DATABASE_SCHEMA.md` | `web/docs/database/RUN_DATABASE_SCHEMA.md` |
| `web/SUPABASE_AUDIO_CONFIGURATION.md` | `web/docs/database/SUPABASE_AUDIO_CONFIGURATION.md` |
| `web/SUPABASE_CONNECTION_FIX.md` | `web/docs/database/SUPABASE_CONNECTION_FIX.md` |
| `web/SUPABASE_PRODUCTION_READY.md` | `web/docs/database/SUPABASE_PRODUCTION_READY.md` |
| `web/SUPABASE_PRODUCTION_STATUS.md` | `web/docs/database/SUPABASE_PRODUCTION_STATUS.md` |
| `web/SUPABASE_QUICKSTART.md` | `web/docs/database/SUPABASE_QUICKSTART.md` |
| `web/SUPABASE_SETUP_CHECKLIST.md` | `web/docs/database/SUPABASE_SETUP_CHECKLIST.md` |
| `web/SUPABASE_SETUP_GUIDE.md` | `web/docs/database/SUPABASE_SETUP_GUIDE.md` |
| `web/FIX_SUPABASE_PRODUCTION.md` | `web/docs/database/FIX_SUPABASE_PRODUCTION.md` |
| `web/PRODUCTION_SUPABASE_CONFIG.md` | `web/docs/database/PRODUCTION_SUPABASE_CONFIG.md` |

#### Gallery (`web/docs/gallery/`)

| From | To |
|------|-----|
| `web/GALLERY_DATABASE_SETUP.md` | `web/docs/gallery/GALLERY_DATABASE_SETUP.md` |
| `web/GALLERY_IMAGES_OPTIMIZATION.md` | `web/docs/gallery/GALLERY_IMAGES_OPTIMIZATION.md` |
| `web/GALLERY_MIGRATION_GUIDE.md` | `web/docs/gallery/GALLERY_MIGRATION_GUIDE.md` |
| `web/GALLERY_RESTORE_GUIDE.md` | `web/docs/gallery/GALLERY_RESTORE_GUIDE.md` |
| `web/IMAGE_OPTIMIZATION_NEEDED.md` | `web/docs/gallery/IMAGE_OPTIMIZATION_NEEDED.md` |

#### Performance (`web/docs/performance/`)

| From | To |
|------|-----|
| `web/PERFORMANCE_AUDIT_SUMMARY.md` | `web/docs/performance/PERFORMANCE_AUDIT_SUMMARY.md` |
| `web/PERFORMANCE_IMPLEMENTATION_COMPLETE.md` | `web/docs/performance/PERFORMANCE_IMPLEMENTATION_COMPLETE.md` |
| `web/PERFORMANCE_IMPLEMENTATION_STATUS.md` | `web/docs/performance/PERFORMANCE_IMPLEMENTATION_STATUS.md` |
| `web/PERFORMANCE_INTEGRATION_GUIDE.md` | `web/docs/performance/PERFORMANCE_INTEGRATION_GUIDE.md` |
| `web/PERFORMANCE_OPTIMIZATION_COMPLETE.md` | `web/docs/performance/PERFORMANCE_OPTIMIZATION_COMPLETE.md` |
| `web/PERFORMANCE_QUICK_WINS.md` | `web/docs/performance/PERFORMANCE_QUICK_WINS.md` |

#### Sync (`web/docs/sync/`)

| From | To |
|------|-----|
| `web/BIDIRECTIONAL_SYNC_COMPLETE.md` | `web/docs/sync/BIDIRECTIONAL_SYNC_COMPLETE.md` |
| `web/SYNC_ARCHITECTURE.md` | `web/docs/sync/SYNC_ARCHITECTURE.md` |
| `web/SYNC_COMPLETE.md` | `web/docs/sync/SYNC_COMPLETE.md` |
| `web/SYNC_QUICKSTART.md` | `web/docs/sync/SYNC_QUICKSTART.md` |
| `web/SYNC_SYSTEM_READY.md` | `web/docs/sync/SYNC_SYSTEM_READY.md` |

#### Media (`web/docs/media/`)

| From | To |
|------|-----|
| `web/ADD_VIDEOS_GUIDE.md` | `web/docs/media/ADD_VIDEOS_GUIDE.md` |
| `web/MEDIA_FIX_SUMMARY.md` | `web/docs/media/MEDIA_FIX_SUMMARY.md` |
| `web/MEDIA_RELINKING_COMPLETE.md` | `web/docs/media/MEDIA_RELINKING_COMPLETE.md` |
| `web/MEDIA_RELINKING_GUIDE.md` | `web/docs/media/MEDIA_RELINKING_GUIDE.md` |
| `web/QUICK_FIX_MEDIA_LINKS.md` | `web/docs/media/QUICK_FIX_MEDIA_LINKS.md` |

#### Artwork (`web/docs/artwork/`)

| From | To |
|------|-----|
| `web/ARTWORK_EXTRACTION.md` | `web/docs/artwork/ARTWORK_EXTRACTION.md` |
| `web/ARTWORK_PRIORITIZATION.md` | `web/docs/artwork/ARTWORK_PRIORITIZATION.md` |
| `web/ARTWORK_UPDATE_GUIDE.md` | `web/docs/artwork/ARTWORK_UPDATE_GUIDE.md` |
| `web/EP_ARTWORK_FIX_COMPLETE.md` | `web/docs/artwork/EP_ARTWORK_FIX_COMPLETE.md` |
| `web/PRODUCTION_IMAGE_FIX.md` | `web/docs/artwork/PRODUCTION_IMAGE_FIX.md` |
| `web/QUICK_ARTWORK_UPDATE.md` | `web/docs/artwork/QUICK_ARTWORK_UPDATE.md` |
| `web/README_SPOTIFY_ARTWORK.md` | `web/docs/artwork/README_SPOTIFY_ARTWORK.md` |
| `web/OPTIMIZATION_COMPLETE.md` | `web/docs/artwork/OPTIMIZATION_COMPLETE.md` |
| `web/OPTIMIZED_UPLOAD_WORKFLOW.md` | `web/docs/artwork/OPTIMIZED_UPLOAD_WORKFLOW.md` |

#### BPM/Analysis (`web/docs/analysis/`)

| From | To |
|------|-----|
| `web/ANALYSIS_COMPLETE.md` | `web/docs/analysis/ANALYSIS_COMPLETE.md` |
| `web/ANALYZE_SONIC_DNA.md` | `web/docs/analysis/ANALYZE_SONIC_DNA.md` |
| `web/BPM_ANALYSIS_RECOMMENDATION.md` | `web/docs/analysis/BPM_ANALYSIS_RECOMMENDATION.md` |
| `web/BPM_DETECTION_GUIDE.md` | `web/docs/analysis/BPM_DETECTION_GUIDE.md` |
| `web/BPM_DETECTION_STATUS.md` | `web/docs/analysis/BPM_DETECTION_STATUS.md` |
| `web/BPM_UPDATE_FIX.md` | `web/docs/analysis/BPM_UPDATE_FIX.md` |
| `web/COMPLETE_LIBRARY_ANALYSIS.md` | `web/docs/analysis/COMPLETE_LIBRARY_ANALYSIS.md` |
| `web/RUN_COMPREHENSIVE_ANALYSIS.md` | `web/docs/analysis/RUN_COMPREHENSIVE_ANALYSIS.md` |
| `web/SONIC_DNA_DEFINITION.md` | `web/docs/analysis/SONIC_DNA_DEFINITION.md` |
| `web/SONIC_DNA_FIXES_SUMMARY.md` | `web/docs/analysis/SONIC_DNA_FIXES_SUMMARY.md` |
| `web/SONIC_DNA_OPTIMIZATION_SUMMARY.md` | `web/docs/analysis/SONIC_DNA_OPTIMIZATION_SUMMARY.md` |
| `web/TEMPO_DATABASE_INTEGRATION.md` | `web/docs/analysis/TEMPO_DATABASE_INTEGRATION.md` |
| `web/TEMPO_OPTIMIZATION_SUMMARY.md` | `web/docs/analysis/TEMPO_OPTIMIZATION_SUMMARY.md` |
| `web/WAVEFORM_AGENT_INTEGRATION.md` | `web/docs/analysis/WAVEFORM_AGENT_INTEGRATION.md` |
| `web/WAVEFORM_STATUS.md` | `web/docs/analysis/WAVEFORM_STATUS.md` |

#### Deployment (`web/docs/deployment/`)

| From | To |
|------|-----|
| `web/DEPLOYMENT_READY.md` | `web/docs/deployment/DEPLOYMENT_READY.md` |
| `web/DEPLOYMENT_SUCCESS.md` | `web/docs/deployment/DEPLOYMENT_SUCCESS.md` |
| `web/PRODUCTION_DEBUG_FIX.md` | `web/docs/deployment/PRODUCTION_DEBUG_FIX.md` |
| `web/RECOVERY_INSTRUCTIONS.md` | `web/docs/deployment/RECOVERY_INSTRUCTIONS.md` |
| `web/RESTART_SERVER.md` | `web/docs/deployment/RESTART_SERVER.md` |
| `web/VERCEL_ENV_SETUP.md` | `web/docs/deployment/VERCEL_ENV_SETUP.md` |
| `web/update-root-and-deploy.sh` | `web/docs/deployment/update-root-and-deploy.sh` |

#### Environment (`web/docs/environment/`)

| From | To |
|------|-----|
| `web/ENV_VARIABLES.md` | `web/docs/environment/ENV_VARIABLES.md` |
| `web/NEED_PROJECT_URL.md` | `web/docs/environment/NEED_PROJECT_URL.md` |
| `web/QUICK_START_ANALYSIS.md` | `web/docs/environment/QUICK_START_ANALYSIS.md` |
| `web/START_HERE.md` | `web/docs/environment/START_HERE.md` |
| `web/AI_API_KEYS.md` | `web/docs/environment/AI_API_KEYS.md` |
| `web/CHECK_API_KEYS.md` | `web/docs/environment/CHECK_API_KEYS.md` |
| `web/STRIPE_SETUP_GUIDE.md` | `web/docs/environment/STRIPE_SETUP_GUIDE.md` |

#### Reference (`web/docs/reference/`)

| From | To |
|------|-----|
| `web/ARCHITECTURE_AUDIT.md` | `web/docs/reference/ARCHITECTURE_AUDIT.md` |
| `web/IMPORT_FIX_SUMMARY.md` | `web/docs/reference/IMPORT_FIX_SUMMARY.md` |
| `web/SCHEMA_TO_COPY.txt` | `web/docs/reference/SCHEMA_TO_COPY.txt` |
| `web/migration-log.txt` | `web/docs/reference/migration-log.txt` |
| `web/WHY_I_CANT_AUTOMATE.md` | `web/docs/reference/WHY_I_CANT_AUTOMATE.md` |

#### FTP/Sync (`web/docs/ftp/`)

| From | To |
|------|-----|
| `web/FTP_SCAN_GUIDE.md` | `web/docs/ftp/FTP_SCAN_GUIDE.md` |
| `web/HANDLING_LARGE_FILES.md` | `web/docs/ftp/HANDLING_LARGE_FILES.md` |
| `web/HOW_TO_ADD_MUSIC_FOLDERS.md` | `web/docs/ftp/HOW_TO_ADD_MUSIC_FOLDERS.md` |

#### Final Status (`web/docs/final/`)

| From | To |
|------|-----|
| `web/FINAL_STATUS_COMPLETE.md` | `web/docs/final/FINAL_STATUS_COMPLETE.md` |
| `web/FINAL_STEP.md` | `web/docs/final/FINAL_STEP.md` |
| `web/IMPLEMENTATION_FINAL_STATUS.md` | `web/docs/final/IMPLEMENTATION_FINAL_STATUS.md` |
| `web/IMPLEMENTATION_SUMMARY.md` | `web/docs/final/IMPLEMENTATION_SUMMARY.md` |
| `web/INTEGRATION_COMPLETE.md` | `web/docs/final/INTEGRATION_COMPLETE.md` |
| `web/READY_TO_GO.md` | `web/docs/final/READY_TO_GO.md` |
| `web/REMAINING_TASKS_STATUS.md` | `web/docs/final/REMAINING_TASKS_STATUS.md` |
| `web/RESYNC_COMPLETE.md` | `web/docs/final/RESYNC_COMPLETE.md` |
| `web/RESYNC_STATUS.md` | `web/docs/final/RESYNC_STATUS.md` |
| `web/UPLOAD_STATUS.md` | `web/docs/final/UPLOAD_STATUS.md` |
| `web/URGENT_NEXT_STEP.md` | `web/docs/final/URGENT_NEXT_STEP.md` |
| `web/CAMPAIGN_IMPLEMENTATION_GUIDE.md` | `web/docs/final/CAMPAIGN_IMPLEMENTATION_GUIDE.md` |
| `web/DATABASE_SETUP.md` | `web/docs/final/DATABASE_SETUP.md` |

#### Updates (`web/docs/updates/`)

| From | To |
|------|-----|
| `web/ADD_VIDEOS_GUIDE.md` | `web/docs/updates/ADD_VIDEOS_GUIDE.md` |
| `web/UPDATE_RELEASES.md` | `web/docs/updates/UPDATE_RELEASES.md` |
| `web/AUDIO_URL_RESOLUTION.md` | `web/docs/updates/AUDIO_URL_RESOLUTION.md` |
| `web/ENHANCED_ANALYSIS_UPDATE.md` | `web/docs/updates/ENHANCED_ANALYSIS_UPDATE.md` |
| `web/INSTAGRAM_SETUP_FINAL.md` | `web/docs/updates/INSTAGRAM_SETUP_FINAL.md` |
| `web/OG_IMAGE_DEPLOYMENT_CHECKLIST.md` | `web/docs/updates/OG_IMAGE_DEPLOYMENT_CHECKLIST.md` |
| `web/PLAYLIST_MIGRATION_GUIDE.md` | `web/docs/updates/PLAYLIST_MIGRATION_GUIDE.md` |
| `web/QUICK_FIX_SUMMARY.md` | `web/docs/updates/QUICK_FIX_SUMMARY.md` |
| `web/TOAST_MIGRATION_EXECUTION_GUIDE.md` | `web/docs/updates/TOAST_MIGRATION_EXECUTION_GUIDE.md` |
| `web/VERIFICATION.md` | `web/docs/updates/VERIFICATION.md` |
| `web/VERIFY_PRODUCTION.md` | `web/docs/updates/VERIFY_PRODUCTION.md` |

---

## Files Safe to Delete

The following files can be safely deleted:

| File | Reason |
|------|--------|
| `PHASE_1_READY.txt` | **CORRUPTED FILE** - contains garbled text |
| `image-mappings-preliminary.txt` | Preliminary template, superseded by `image-mappings.txt` |
| `image-mappings-template.txt` | Template file, superseded by actual mappings |
| `.DS_Store` (multiple) | macOS system files |
| `ollama.log` | Log file, can be regenerated |

---

## References That Need Updating

### Shell Script References

If shell scripts reference other scripts by relative path, these will need updates:

| Script | Potential References |
|--------|---------------------|
| `scripts/images/*.sh` | May reference `image-mappings.txt` at root |
| `scripts/deployment/*.sh` | May reference `.env` at root |

### Documentation References

Markdown files may reference paths like:
- `./image-mappings.txt` → `docs/text/image-mappings.txt`
- `./scripts/etl_validate.js` → stays in `scripts/`
- Web docs referencing root-level scripts

### Recommended Search Patterns

Before executing the reorganization, search for these patterns:

```bash
# Find references to image-mappings.txt
grep -r "image-mappings.txt" --include="*.md" --include="*.sh" .

# Find references to root-level scripts
grep -r "\./.*\.sh" --include="*.md" .

# Find references to root .md files
grep -r "README_ETL\|DEV_ENTRY\|QUICKSTART" --include="*.md" .
```

---

## Execution Steps

### Phase 1: Create Directory Structure

```bash
# Create docs directories
mkdir -p docs/project
mkdir -p docs/deployment
mkdir -p docs/database
mkdir -p docs/docker
mkdir -p docs/phases
mkdir -p docs/gallery
mkdir -p docs/text

# Create scripts directories  
mkdir -p scripts/images
mkdir -p scripts/deployment
mkdir -p scripts/utilities
mkdir -p scripts/migration

# Create web/docs subdirectories
mkdir -p web/docs/admin
mkdir -p web/docs/instagram
mkdir -p web/docs/agents
mkdir -p web/docs/database
mkdir -p web/docs/gallery
mkdir -p web/docs/performance
mkdir -p web/docs/sync
mkdir -p web/docs/media
mkdir -p web/docs/artwork
mkdir -p web/docs/analysis
mkdir -p web/docs/deployment
mkdir -p web/docs/environment
mkdir -p web/docs/reference
mkdir -p web/docs/ftp
mkdir -p web/docs/final
mkdir -p web/docs/updates
```

### Phase 2: Move Files

Use the mappings above to move files. Example:

```bash
# Move root markdown files
mv QUICKSTART.md docs/project/
mv DEPLOY_NOW.md docs/deployment/
# ... continue for all files

# Move shell scripts
mv add-images.sh scripts/images/
mv docker-start.sh scripts/deployment/
# ... continue for all scripts

# Move web markdown files
mv web/ADMIN_DASHBOARD_COMPLETE.md web/docs/admin/
mv web/INSTAGRAM_*.md web/docs/instagram/
# ... continue for all web files
```

### Phase 3: Update References

After moving files, search and update any broken references:

```bash
# Find and replace broken references
# This is a manual process - use your IDE's find/replace across the project
```

### Phase 4: Delete Deprecated Files

```bash
# Delete files marked for deletion
rm PHASE_1_READY.txt
rm image-mappings-preliminary.txt
rm image-mappings-template.txt
rm -f .DS_Store
rm ollama.log
```

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Files staying at root | 11 |
| Root markdown files to move | ~50 |
| Root shell scripts to move | ~15 |
| Root utility scripts to move | 5 |
| Root text files to move | 2 |
| Web markdown files to reorganize | ~200 |
| Files marked for deletion | 6 |
| New directories to create | 26 |

---

## Verification Checklist

After executing the plan:

- [ ] All essential config files remain at root
- [ ] `docs/` directory contains all project documentation
- [ ] `scripts/` directory contains all utility scripts
- [ ] `web/docs/` contains all web-specific documentation
- [ ] No broken symlinks or references
- [ ] Project builds and runs successfully
- [ ] All scripts are executable (`chmod +x *.sh`)
- [ ] Documentation links work correctly
