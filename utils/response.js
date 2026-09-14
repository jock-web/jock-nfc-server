export const success = (res, data = undefined, status = 200) => {
  const body = { success: true };
  if (data !== undefined) body.data = data;
  return res.status(status).json(body);
};

export const failure = (res, error, status = 400) => {
  return res.status(status).json({ success: false, error });
};
