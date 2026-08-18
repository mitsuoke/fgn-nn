const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');

menuButton?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
  });
});

document.querySelector('#year').textContent = new Date().getFullYear();

const modal = document.querySelector('#quiz-modal');
const quiz = document.querySelector('#production-quiz');
const steps = [...document.querySelectorAll('.quiz-step')];
const nextButton = document.querySelector('#quiz-next');
const backButton = document.querySelector('#quiz-back');
const submitButton = document.querySelector('#quiz-submit');
const progressBar = document.querySelector('#quiz-progress-bar');
let currentStep = 0;
let lastFocused = null;

function renderStep() {
  steps.forEach((step, index) => step.classList.toggle('active', index === currentStep));
  backButton.disabled = currentStep === 0;
  nextButton.hidden = currentStep === steps.length - 1;
  submitButton.hidden = currentStep !== steps.length - 1;
  progressBar.style.width = `${((currentStep + 1) / steps.length) * 100}%`;
}

function openQuiz() {
  lastFocused = document.activeElement;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  renderStep();
  modal.querySelector('.modal-close').focus();
}

function closeQuiz() {
  modal.hidden = true;
  document.body.classList.remove('modal-open');
  lastFocused?.focus();
}

document.querySelectorAll('[data-open-quiz]').forEach((button) => button.addEventListener('click', openQuiz));
document.querySelectorAll('[data-close-quiz]').forEach((button) => button.addEventListener('click', closeQuiz));

function currentStepIsValid() {
  const active = steps[currentStep];
  const required = [...active.querySelectorAll('[required]')];
  const radioGroups = [...new Set(required.filter((item) => item.type === 'radio').map((item) => item.name))];
  const radiosValid = radioGroups.every((name) => active.querySelector(`[name="${name}"]:checked`));
  const fieldsValid = required.filter((item) => item.type !== 'radio').every((item) => item.reportValidity());
  return radiosValid && fieldsValid;
}

nextButton?.addEventListener('click', () => {
  if (!currentStepIsValid()) return;
  currentStep = Math.min(currentStep + 1, steps.length - 1);
  renderStep();
});

backButton?.addEventListener('click', () => {
  currentStep = Math.max(currentStep - 1, 0);
  renderStep();
});

quiz?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!currentStepIsValid()) return;

  const data = new FormData(quiz);
  const ready = data.getAll('ready').join(', ') || 'не указано';
  const subject = encodeURIComponent('Запрос на расчёт производства FGN');
  const body = encodeURIComponent([
    `Имя: ${data.get('name')}`,
    `Контакт: ${data.get('contact')}`,
    `Продукт: ${data.get('product')}`,
    `Объём: ${data.get('volume')}`,
    `Подготовлено: ${ready}`,
    `Описание: ${data.get('details') || 'не указано'}`
  ].join('\n'));

  window.location.href = `mailto:burunduk.shop@mail.ru?subject=${subject}&body=${body}`;
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modal.hidden) closeQuiz();
});
