import 'dotenv/config';
import { createApp } from './app.js';

const port = parseInt(process.env.API_PORT, 10) || 4000;
createApp().listen(port, '0.0.0.0', () => {
  console.log(`Clio API listening on ${port}`);
});
