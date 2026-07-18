import app from './app';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Cinemiq Server ready at http://localhost:${PORT}`);
});
