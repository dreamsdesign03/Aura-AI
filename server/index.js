const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Aura AI Express Server listening on http://localhost:${PORT}`);
});
