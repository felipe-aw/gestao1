module.exports = {
  apps: [
    {
      name: "gestao-sofitel",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0 -p 3005",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
    },
  ],
};
