'use strict';

const KEY = 'finfuture-data';
const CATS = {
  income: ['Зарплата', 'Стипендия', 'Подработка', 'Другое'],
  expense: ['Еда', 'Транспорт', 'Жильё', 'Учёба', 'Развлечения', 'Здоровье', 'Другое']
};
const COLORS = ['#e8a100', '#c8372d', '#3b5bdb', '#0f7a5c', '#be185d', '#0284c7', '#7c3aed'];
const TYPE_NAMES = { income: 'Доход', expense: 'Расход', saving: 'Накопление' };

const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('ru-RU') + ' сом';
const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const sum = (list, type) => list.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);

// Данные: операции, цели, лимит и тема. Загружаются из localStorage.
let data = { tx: [], goals: [], limit: 0, theme: 'light' };
try { Object.assign(data, JSON.parse(localStorage.getItem(KEY))); } catch (e) { /* пустые данные */ }

function saveData() {
  localStorage.setItem(KEY, JSON.stringify(data));
}

// ---------- Расчёты ----------
function calculateIncome(list = data.tx) { return sum(list, 'income'); }
function calculateExpenses(list = data.tx) { return sum(list, 'expense'); }
function calculateBalance() {
  return calculateIncome() - calculateExpenses() - sum(data.tx, 'saving');
}

function periodStart() {
  const p = $('period').value, d = new Date();
  if (p === 'week') d.setDate(d.getDate() - 6);
  else if (p === 'month') d.setDate(1);
  else if (p === 'year') d.setMonth(0, 1);
  else return '';
  return iso(d);
}

// ---------- Операции ----------
function addTransaction(type, amount, category, date, goalId = null) {
  if (!(amount > 0) || !date) return;
  data.tx.push({ id: uid(), type, amount, category, date, goalId });
  saveData();
  render();
}

function deleteTransaction(id) {
  data.tx = data.tx.filter(t => t.id !== id);
  saveData();
  render();
}

// ---------- Цели ----------
function addSavingsGoal(name, target, monthly) {
  if (!name || !(target > 0)) return;
  data.goals.push({ id: uid(), name, target, monthly });
  saveData();
  render();
}

function updateProgress() {
  $('goals').innerHTML = data.goals.map(g => {
    const saved = sum(data.tx.filter(t => t.goalId === g.id), 'saving');
    const left = Math.max(0, g.target - saved);
    const p = Math.min(100, saved / g.target * 100);
    let hint = '';
    if (!left) hint = 'Цель достигнута!';
    else if (g.monthly > 0) {
      const m = Math.ceil(left / g.monthly), d = new Date();
      d.setMonth(d.getMonth() + m);
      hint = `Прогноз: ещё ${m} мес. при взносе ${fmt(g.monthly)} в месяц (${d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })})`;
    }
    return `<div class="goal">
      <div class="row"><b>${esc(g.name)}</b><button class="x" data-gdel="${g.id}" aria-label="Удалить цель">×</button></div>
      <div class="track"><div style="width:${p}%"></div></div>
      <small>Накоплено ${fmt(saved)} из ${fmt(g.target)} (${Math.round(p)}%). Осталось ${fmt(left)}</small>
      <small>${hint}</small>
      <div class="row"><input type="number" min="1" placeholder="Сумма взноса"><button data-dep="${g.id}">Внести</button></div>
    </div>`;
  }).join('') || '<small>Целей пока нет. Создайте первую выше.</small>';
}

// ---------- Диаграмма ----------
function renderChart(list) {
  const cv = $('chart'), c = cv.getContext('2d'), by = {};
  list.filter(t => t.type === 'expense').forEach(t => { by[t.category] = (by[t.category] || 0) + t.amount; });
  const entries = Object.entries(by), total = entries.reduce((s, e) => s + e[1], 0);
  c.clearRect(0, 0, cv.width, cv.height);
  if (!total) { $('legend').innerHTML = '<li><small>Расходов за период нет</small></li>'; return; }
  let a = -Math.PI / 2;
  entries.forEach(([, v], i) => {
    const ang = v / total * 2 * Math.PI;
    c.beginPath(); c.moveTo(110, 110); c.arc(110, 110, 105, a, a + ang); c.closePath();
    c.fillStyle = COLORS[i % COLORS.length]; c.fill();
    a += ang;
  });
  c.globalCompositeOperation = 'destination-out';
  c.beginPath(); c.arc(110, 110, 58, 0, 7); c.fill();
  c.globalCompositeOperation = 'source-over';
  $('legend').innerHTML = entries.map(([k, v], i) =>
    `<li><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(k)}: ${fmt(v)} (${Math.round(v / total * 100)}%)</li>`).join('');
}

function renderAnalytics(list) {
  const inc = calculateIncome(list), exp = calculateExpenses(list), mx = Math.max(inc, exp, 1);
  $('incT').textContent = fmt(inc);
  $('expT').textContent = fmt(exp);
  $('barInc').style.width = inc / mx * 100 + '%';
  $('barExp').style.width = exp / mx * 100 + '%';

  const monthStart = iso(new Date()).slice(0, 8) + '01';
  const spent = calculateExpenses(data.tx.filter(t => t.date >= monthStart));
  const pct = data.limit ? spent / data.limit * 100 : 0;
  $('budgetBar').style.width = Math.min(100, pct) + '%';
  $('budgetBar').className = pct >= 100 ? 'e' : '';
  $('budgetText').textContent = data.limit
    ? `Потрачено ${Math.round(pct)}% бюджета: ${fmt(spent)} из ${fmt(data.limit)}`
    : 'Укажите лимит, чтобы видеть, сколько бюджета потрачено.';
  $('warn').textContent = pct >= 100 ? 'Лимит расходов превышен!' : pct >= 80 ? 'Вы близки к лимиту расходов.' : '';
  renderChart(list);
}

// ---------- Экспорт ----------
function exportReport() {
  const rows = [['Дата', 'Тип', 'Категория', 'Сумма, сом']]
    .concat(data.tx.map(t => [t.date, TYPE_NAMES[t.type], t.category, t.amount]));
  const csv = '\ufeff' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'finfuture-report.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Отрисовка ----------
function render() {
  const list = data.tx.filter(t => t.date >= periodStart());
  $('balance').textContent = fmt(calculateBalance());
  $('income').textContent = fmt(calculateIncome(list));
  $('expenses').textContent = fmt(calculateExpenses(list));
  $('savings').textContent = fmt(sum(data.tx, 'saving'));
  $('list').innerHTML = list.slice().sort((a, b) => b.date.localeCompare(a.date)).map(t =>
    `<li><span>${esc(t.category)}<small>${t.date}</small></span>
      <b class="${t.type}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</b>
      <button class="x" data-del="${t.id}" aria-label="Удалить операцию">×</button></li>`).join('')
    || '<li><small>Операций за период нет. Добавьте первую.</small></li>';
  updateProgress();
  renderAnalytics(list);
}

function fillCats() {
  $('category').innerHTML = CATS[$('type').value].map(c => `<option>${c}</option>`).join('');
}

function applyTheme() {
  document.documentElement.dataset.theme = data.theme;
  $('themeBtn').textContent = data.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
}

// ---------- События ----------
$('txForm').onsubmit = e => {
  e.preventDefault();
  addTransaction($('type').value, +$('amount').value, $('category').value, $('date').value);
  $('amount').value = '';
};
$('goalForm').onsubmit = e => {
  e.preventDefault();
  addSavingsGoal($('gName').value.trim(), +$('gTarget').value, +$('gMonthly').value || 0);
  e.target.reset();
};
$('type').onchange = fillCats;
$('period').onchange = render;
$('exportBtn').onclick = exportReport;
$('limit').onchange = () => { data.limit = +$('limit').value || 0; saveData(); render(); };
$('themeBtn').onclick = () => { data.theme = data.theme === 'dark' ? 'light' : 'dark'; applyTheme(); saveData(); };

document.addEventListener('click', e => {
  const d = e.target.dataset;
  if (d.del) deleteTransaction(d.del);
  if (d.gdel) {
    data.goals = data.goals.filter(g => g.id !== d.gdel);
    data.tx = data.tx.filter(t => t.goalId !== d.gdel);
    saveData(); render();
  }
  if (d.dep) {
    const amt = +e.target.previousElementSibling.value, g = data.goals.find(x => x.id === d.dep);
    if (!(amt > 0)) return;
    if (amt > calculateBalance()) return alert('Недостаточно средств на балансе.');
    addTransaction('saving', amt, 'Цель: ' + g.name, iso(new Date()), g.id);
  }
});

$('date').value = iso(new Date());
$('limit').value = data.limit || '';
applyTheme();
fillCats();
render();
