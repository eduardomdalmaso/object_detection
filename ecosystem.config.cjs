module.exports = {
  apps: [
    {
      name: 'obdet-backend',
      script: '/home/administrator/miniconda3/envs/detection/bin/python',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8005',
      cwd: '/home/administrator/object_detection/backend',
      autorestart: true,
      watch: false,
      max_memory_restart: '16G',
      env: {
        NODE_ENV: 'production',
        PYTHONPATH: '/home/administrator/object_detection/backend'
      }
    }
  ]
};
