module.exports = {
  apps: [
    {
      name: 'obdet-backend',
      script: '/home/administrator/miniconda3/envs/detection/bin/python',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
      cwd: '/home/administrator/object_detection/backend',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PYTHONPATH: '/home/administrator/object_detection/backend'
      }
    },
    {
      name: 'obdet-frontend',
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0',
      cwd: '/home/administrator/object_detection',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
