document.querySelectorAll('.faq-list').forEach((list) => {
  const items = [...list.querySelectorAll('details.faq-item')];
  items.forEach((item) => item.addEventListener('toggle', () => {
    if (!item.open) return;
    items.forEach((other) => {
      if (other !== item) other.open = false;
    });
  }));
});

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;

  const data = event.data;
  if (!data || data.type !== 'fgn-bitrix-height') return;

  const frame = document.querySelector(
    `iframe[data-bitrix-form-frame="${data.form}"]`
  );

  if (!frame || event.source !== frame.contentWindow) return;

  const height = Number(data.height);
  if (!Number.isFinite(height) || height < 100 || height > 5000) return;

  frame.style.height = `${Math.ceil(height)}px`;
});
