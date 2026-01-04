document.addEventListener('click', (e) => {
  const t = e.target;
  if (t instanceof HTMLButtonElement && t.id === 'btnRetry') {
    location.reload();
  }
});
