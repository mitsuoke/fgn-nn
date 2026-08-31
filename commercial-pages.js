document.querySelectorAll('.faq-list').forEach((list) => {
  const items = [...list.querySelectorAll('details.faq-item')];
  items.forEach((item) => item.addEventListener('toggle', () => {
    if (!item.open) return;
    items.forEach((other) => {
      if (other !== item) other.open = false;
    });
  }));
});
