module.exports = {
  apps: [{
    name: "cabani-shoes-outlet",
    script: "server.js",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    watch: false,
    max_memory_restart: "350M",
    env: { NODE_ENV: "production", TRUST_PROXY: "1" }
  }]
};
