module.exports = {
  apps: [
    {
      name: 'obdet-backend',
      script: '/home/hades/miniconda3/envs/detection/bin/python',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
      cwd: '/home/hades/projetos/object_detection/backend',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PYTHONPATH: '/home/hades/projetos/object_detection/backend'
      }
    },
    {
      name: 'obdet-frontend',
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0',
      cwd: '/home/hades/projetos/object_detection',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
