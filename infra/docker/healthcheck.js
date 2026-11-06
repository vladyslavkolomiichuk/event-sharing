// Exits with zero when the service health route answers.
const { HOST, PORT } = process.env;
const response = await fetch(`http://${HOST}:${PORT}/health`).catch(() => null);

process.exit(response?.ok ? 0 : 1);
