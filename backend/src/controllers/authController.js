import { AuthError } from '../services/authService.js';

export function loginHandler(auth) {
  return (req, res) => {
    const password = req.body?.password;
    if (typeof password !== 'string' || password === '') {
      return res.status(400).json({ error: 'password_required' });
    }
    try {
      return res.json({ token: auth.login(password, req.ip) });
    } catch (e) {
      if (e instanceof AuthError) {
        return res.status(e.code === 'locked' ? 429 : 401).json({ error: e.code });
      }
      throw e;
    }
  };
}
