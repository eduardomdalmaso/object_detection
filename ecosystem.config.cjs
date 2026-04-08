module.exports = {
  apps: [
    {
      name: 'obdet-backend',
      script: '/home/hades/miniconda3/envs/object/bin/python',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
      cwd: '/home/hades/Documents/object_detection/backend',
      autorestart: true,
      watch: false,
      max_memory_restart: '16G',
      env: {
        NODE_ENV: 'production',
        PYTHONPATH: '/home/hades/Documents/object_detection/backend'
      }
    }
  ]
};
