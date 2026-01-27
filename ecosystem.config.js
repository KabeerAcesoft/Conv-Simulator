module.exports = {
  apps: [
    {
      name: 'simulation-api',
      script: 'dist/src/main.js',
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',

      // Environment
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
      },

      // Process management
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
      max_memory_restart: '2G',

      // Restart policy
      autorestart: true,
      max_restarts: 5,
      min_uptime: '30s',

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      log_file: 'logs/app.log',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      combine_logs: true,
      merge_logs: true,

      // Monitoring
      monitoring: true,
      pmx: true,

      // Performance
      node_args: [
        '--max-old-space-size=2048',
        '--optimize-for-size',
        '--gc-interval=100',
      ],

      // Health check
      health_check_grace_period: 3000,

      // Graceful shutdown
      shutdown_with_message: true,

      // Development specific
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'tmp', '.git'],
    },
  ],

  deploy: {
    production: {
      user: 'nodejs',
      host: ['production-server'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/simulation-api.git',
      path: '/var/www/simulation-api',
      'pre-deploy-local': '',
      'post-deploy':
        'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      ssh_options: 'StrictHostKeyChecking=no',
    },

    staging: {
      user: 'nodejs',
      host: ['staging-server'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/simulation-api.git',
      path: '/var/www/simulation-api-staging',
      'post-deploy':
        'npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
    },
  },
};
