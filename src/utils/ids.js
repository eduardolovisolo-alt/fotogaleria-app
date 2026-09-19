function sameId(a, b) {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && left === right;
}

module.exports = { sameId };
