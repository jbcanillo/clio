/** Requires a valid `X-Session-Token`; exposes it as req.sessionToken. */
export function requireAuth(auth) {
  return (req, res, next) => {
    const token = req.get('X-Session-Token');
    if (!auth.verify(token)) return res.status(401).json({ error: 'unauthorized' });
    req.sessionToken = token;
    next();
  };
}
