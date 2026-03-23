#!/bin/bash
source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate detection
cd "$(dirname "$0")"
uvicorn main:app --reload --port 8000
