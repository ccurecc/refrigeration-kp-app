import {
  getDoorDescription,
  type ChamberResult,
  type ChamberInput,
  type CostRow,
  type MaterialRow,
  type ProposalResult
} from './calculator'
import { buildSide3dSvg } from './side3dView'
import { buildTopView, topShapeToSvg } from './topView'
import type { CompanySettings, CustomerData, ProposalSettings } from './proposalData'

export interface ProposalPdfChamber {
  input: ChamberInput
  title: string
  result: ChamberResult
  rows: MaterialRow[]
  topDownImageDataUrl?: string
  side3dImageDataUrl?: string
  equipmentImageDataUrl?: string
}

interface ProposalHtmlInput {
  chambers: ProposalPdfChamber[]
  proposalResult: ProposalResult
  proposalMode: 'detailed' | 'compact'
  company: CompanySettings
  customer: CustomerData
  proposal: ProposalSettings
}

interface VisualsPdfInput {
  chambers: ProposalPdfChamber[]
  company: CompanySettings
  customer: CustomerData
  proposal: ProposalSettings
}

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  currency: 'RUB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  style: 'currency'
})

const numberFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2
})

export const DOOR_INSTALLATION_NOTE = 'Примечание: дверь при монтаже может быть установлена в любом месте камеры.'

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatAmount(value: number): string {
  return numberFormatter.format(value)
}

function valueOrLine(value: string, fallback = '____________________'): string {
  return value.trim() ? escapeHtml(value.trim()) : fallback
}

function companyTopLine(company: CompanySettings): string {
  const details = [
    company.legalName,
    company.legalAddress,
    company.inn ? `ИНН ${company.inn}` : '',
    company.kpp ? `КПП ${company.kpp}` : '',
    company.okpo ? `Код ОКПО ${company.okpo}` : ''
  ].filter(Boolean)

  return details.length ? details.map(escapeHtml).join(' | ') : 'Коммерческое предложение'
}

function rowsHtml(rows: MaterialRow[]): string {
  return rows
    .map(
      (row) => `
        <tr>
          <td class="cell-name">${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.unit)}</td>
          <td>${formatAmount(row.amountPerChamber)}</td>
          <td>${formatAmount(row.amountTotal)}</td>
          <td class="cell-money">${rubFormatter.format(row.unitPrice)}</td>
          <td class="cell-money">${rubFormatter.format(row.sum)}</td>
        </tr>
      `
    )
    .join('')
}

function summaryRowsHtml(costRows: CostRow[]): string {
  return costRows
    .map((row) => {
      const cls = row.kind === 'total' ? 'total' : row.kind === 'subtotal' ? 'subtotal' : ''
      return `
        <tr class="${cls}">
          <td>${escapeHtml(row.name)}</td>
          <td>${rubFormatter.format(row.amount)}</td>
        </tr>
      `
    })
    .join('')
}

function chamberBlock(chamber: ProposalPdfChamber, index: number, total: number, detailed: boolean): string {
  const { input, result } = chamber
  const quantity = Math.max(1, Math.round(input.quantity))
  const quantityLabel = quantity > 1 ? ` · ${quantity} шт` : ''

  const side3d = chamber.side3dImageDataUrl
    ? `<img class="rendered" src="${escapeHtml(chamber.side3dImageDataUrl)}" alt="3D-вид камеры с размерами" />`
    : buildSide3dSvg(input, result)

  const equipmentImage =
    input.equipmentEnabled && chamber.equipmentImageDataUrl
      ? `<figure class="equipment-photo"><img src="${chamber.equipmentImageDataUrl}" alt="Фото оборудования" /><figcaption>${escapeHtml(
          input.equipmentName || 'Холодильное оборудование'
        )}</figcaption></figure>`
      : ''

  return `
    <section class="pdf-page chamber-page">
      <header class="chamber-page-head">
        <div>
          <span class="page-kicker">Камера ${index + 1} из ${total}</span>
          <h2 class="chamber-title">${escapeHtml(chamber.title)}${quantityLabel}</h2>
        </div>
        <div class="chamber-page-spec">
          <strong>${escapeHtml(input.panelFilling)} ${input.thicknessMm} мм</strong>
          <span>${result.longSideMm} × ${result.shortSideMm} × ${input.heightMm} мм</span>
        </div>
      </header>
      <table class="proposal-table">
        <thead>
          <tr>
            <th>Номенклатура</th>
            <th>Ед.</th>
            <th>На камеру</th>
            <th>Всего</th>
            <th>Цена</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>${rowsHtml(chamber.rows)}</tbody>
        <tfoot>
          <tr class="chamber-subtotal">
            <td colspan="5">Итого по камере${detailed ? '' : ' (без НДС)'}</td>
            <td class="cell-money">${rubFormatter.format(result.chamberSubtotal)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="drawing">
        <div class="drawing-card side-drawing">
          <h3>3D-вид сбоку · размеры</h3>
          ${side3d}
          <p class="door-installation-note">${escapeHtml(DOOR_INSTALLATION_NOTE)}</p>
        </div>
        <div class="note">
          <h3>Состав</h3>
          <p>${escapeHtml(result.chamberSummary)}</p>
          <p>Дверь: ${escapeHtml(getDoorDescription(input))}.</p>
          ${equipmentImage}
        </div>
      </div>
    </section>
  `
}

export function buildProposalHtml({
  chambers,
  proposalResult,
  proposalMode,
  company,
  customer,
  proposal
}: ProposalHtmlInput): string {
  const today = new Date().toLocaleDateString('ru-RU')
  const detailed = proposalMode === 'detailed'
  const proposalType = detailed ? 'Коммерческое предложение' : 'Краткое коммерческое предложение'
  const validUntil = proposal.validUntil ? new Date(`${proposal.validUntil}T00:00:00`).toLocaleDateString('ru-RU') : ''
  const proposalNote = proposal.note.trim()

  const chamberBlocks = chambers.map((chamber, index) => chamberBlock(chamber, index, chambers.length, detailed)).join('')

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>КП холодильная камера</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      html { background: #fff; }
      body { margin: 0; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .pdf-page { min-height: 272mm; break-after: page; page-break-after: always; }
      .pdf-page:last-child { break-after: auto; page-break-after: auto; }
      .page-kicker { display: block; margin-bottom: 4px; color: #f37021; font-size: 9px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
      .topline { padding-bottom: 8px; border-bottom: 1px solid #dfe5e2; color: #617083; text-align: center; font-size: 9px; }
      .header { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; margin-top: 18px; }
      .logo { max-width: 95mm; color: #1d6b55; font-size: 30px; font-weight: 800; line-height: 1.1; }
      .meta { text-align: right; font-size: 11px; }
      .meta div { margin-bottom: 5px; }
      h1 { margin: 0; color: #f37021; font-size: 24px; line-height: 1.15; text-align: center; text-transform: uppercase; }
      h2.chamber-title { margin: 0; color: #124837; font-size: 18px; line-height: 1.2; }
      h3 { margin: 0 0 6px; font-size: 12px; }
      .cover-page { display: flex; flex-direction: column; }
      .cover-main { display: flex; flex: 1; flex-direction: column; justify-content: center; padding: 18mm 0 12mm; }
      .cover-number { margin: 7px 0 0; color: #617083; font-size: 12px; text-align: center; }
      .buyer-card { margin: 18mm auto 0; width: min(150mm, 100%); padding: 9mm 11mm; border: 1px solid #cfd6dd; border-left: 5px solid #1d6b55; background: #f8faf9; }
      .buyer-card h2 { margin: 0 0 6px; color: #124837; font-size: 17px; }
      .buyer-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 14px; color: #617083; }
      .buyer-details span { overflow-wrap: anywhere; }
      .cover-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14mm; }
      .cover-summary div { min-height: 24mm; padding: 6mm 5mm; border: 1px solid #cfd6dd; background: #fff; }
      .cover-summary span { display: block; color: #617083; font-size: 9px; text-transform: uppercase; }
      .cover-summary strong { display: block; margin-top: 7px; color: #124837; font-size: 14px; line-height: 1.2; }
      .cover-summary .cover-total { border-color: #1d6b55; background: #1d6b55; }
      .cover-summary .cover-total span { color: rgba(255, 255, 255, 0.75); }
      .cover-summary .cover-total strong { color: #fff; }
      .cover-foot { padding-top: 8px; border-top: 1px solid #dfe5e2; color: #617083; font-size: 9px; text-align: center; }
      .chamber-page { padding-top: 2mm; }
      .chamber-page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12mm; margin-bottom: 8mm; padding-bottom: 5mm; border-bottom: 2px solid #1d6b55; }
      .chamber-page-spec { flex: 0 0 auto; text-align: right; }
      .chamber-page-spec strong, .chamber-page-spec span { display: block; }
      .chamber-page-spec strong { color: #124837; font-size: 12px; }
      .chamber-page-spec span { margin-top: 3px; color: #617083; }
      table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
      th, td { border: 1px solid #222; padding: 5px 7px; text-align: center; }
      th { background: #55bfdc; color: #fff; font-weight: 700; }
      .proposal-table th:last-child { background: #f37021; }
      .proposal-table .cell-name { text-align: left; width: 38%; }
      .proposal-table .cell-money { text-align: right; white-space: nowrap; }
      .chamber-subtotal td { background: #eef4f1; font-weight: 700; text-align: right; }
      .cost-table { margin-top: 10mm; width: 100%; }
      .cost-table td { text-align: left; }
      .cost-table td:last-child { text-align: right; font-weight: 700; white-space: nowrap; }
      .cost-table .subtotal td { background: #eef4f1; font-weight: 700; }
      .cost-table .total td { background: #f37021; color: #fff; font-size: 13px; font-weight: 800; }
      .final-page { display: flex; flex-direction: column; padding-top: 2mm; }
      .final-page-head { padding-bottom: 6mm; border-bottom: 2px solid #f37021; }
      .final-page-head h2 { margin: 0; color: #124837; font-size: 22px; }
      .final-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8mm; }
      .final-meta div { padding: 5mm; border: 1px solid #cfd6dd; }
      .final-meta span { display: block; color: #617083; font-size: 9px; text-transform: uppercase; }
      .final-meta strong { display: block; margin-top: 4px; color: #124837; font-size: 12px; overflow-wrap: anywhere; }
      .proposal-note { margin-top: 12mm; padding: 6mm 7mm; border: 1px solid #cfd6dd; border-left: 5px solid #f37021; background: #f8faf9; }
      .proposal-note h2 { margin: 0 0 5px; color: #124837; font-size: 15px; }
      .proposal-note p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .drawing { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; margin-top: 8px; break-inside: avoid; }
      .drawing-card, .note { border: 1px solid #cfd6dd; padding: 8px; break-inside: avoid; }
      .drawing-card svg, .drawing-card .rendered { display: block; width: 100%; height: auto; object-fit: contain; }
      .side-drawing svg, .side-drawing .rendered { max-height: 300px; }
      .door-installation-note { margin: 6px 0 0; color: #617083; font-size: 10px; line-height: 1.3; }
      .equipment-photo { margin: 6px 0 0; }
      .equipment-photo img { display: block; width: 100%; max-height: 130px; object-fit: contain; }
      .equipment-photo figcaption { margin-top: 4px; color: #617083; font-size: 10px; }
      .footer { margin-top: auto; padding-top: 8mm; color: #617083; font-size: 9px; break-inside: avoid; }
    </style>
  </head>
  <body>
    <section class="pdf-page cover-page">
      <div class="topline">${companyTopLine(company)}</div>
      <header class="header">
        <div class="logo">${valueOrLine(company.brandName, 'Компания')}</div>
        <div class="meta">
          <div><strong>№:</strong> ${valueOrLine(proposal.number, 'КП 001')} / ${today}</div>
          ${validUntil ? `<div><strong>Действует до:</strong> ${validUntil}</div>` : ''}
          <div><strong>Руководитель проекта:</strong> ${valueOrLine(company.managerName)}</div>
          <div><strong>Телефон:</strong> ${valueOrLine(company.phone)}</div>
          <div><strong>E-mail:</strong> ${valueOrLine(company.email)}</div>
          ${company.web.trim() ? `<div><strong>Web:</strong> ${escapeHtml(company.web.trim())}</div>` : ''}
        </div>
      </header>

      <main class="cover-main">
        <h1>${proposalType}</h1>
        <p class="cover-number">Холодильные камеры · ${valueOrLine(proposal.number, 'КП 001')}</p>

        <section class="buyer-card">
          <span class="page-kicker">Покупатель</span>
          <h2>${valueOrLine(customer.name, 'Не указан')}</h2>
          <div class="buyer-details">
            <span><strong>Телефон:</strong> ${valueOrLine(customer.phone, 'не указан')}</span>
            <span><strong>Почта:</strong> ${valueOrLine(customer.email, 'не указана')}</span>
            ${customer.address.trim() ? `<span><strong>Адрес:</strong> ${escapeHtml(customer.address.trim())}</span>` : ''}
          </div>
        </section>

        <section class="cover-summary">
          <div><span>Камер в КП</span><strong>${chambers.length}</strong></div>
          <div><span>Режим</span><strong>${detailed ? 'Подробное' : 'Краткое'}</strong></div>
          <div><span>НДС</span><strong>${
            proposalResult.vatEnabled ? `${proposalResult.vatRatePercent}%` : 'не облагается'
          }</strong></div>
          <div class="cover-total"><span>Итого к оплате</span><strong>${rubFormatter.format(
            proposalResult.total
          )}</strong></div>
        </section>
      </main>

      <div class="cover-foot">Предложение сформировано ${today}${validUntil ? ` · действительно до ${validUntil}` : ''}</div>
    </section>

    ${chamberBlocks}

    <section class="pdf-page final-page">
      <header class="final-page-head">
        <span class="page-kicker">Итоги коммерческого предложения</span>
        <h2>Сводная смета по камерам</h2>
      </header>
      <section class="final-meta">
        <div><span>Номер предложения</span><strong>${valueOrLine(proposal.number, 'КП 001')}</strong></div>
        <div><span>Покупатель</span><strong>${valueOrLine(customer.name, 'Не указан')}</strong></div>
        <div><span>Количество камер</span><strong>${chambers.length}</strong></div>
      </section>
      <table class="cost-table">
        <tbody>${summaryRowsHtml(proposalResult.costRows)}</tbody>
      </table>
      ${
        proposalNote
          ? `<section class="proposal-note"><h2>Примечание</h2><p>${escapeHtml(proposalNote)}</p></section>`
          : ''
      }
      <div class="footer">Расчет двери не уменьшает площадь стеновых панелей: проем вырезается в готовой стене. Все цены и состав работ действительны на дату формирования КП.</div>
    </section>
  </body>
</html>`
}

function topViewSvg(input: ChamberInput, result: ChamberResult): string {
  const model = buildTopView({
    doorWidthMm: input.doorWidthMm,
    hasPanelFloor: input.hasPanelFloor,
    longMm: result.longSideMm,
    shortMm: result.shortSideMm,
    thicknessMm: input.thicknessMm
  })

  return `<svg viewBox="0 0 ${model.width} ${model.height}" role="img" aria-label="Вид сверху">${model.shapes
    .map(topShapeToSvg)
    .join('')}</svg>`
}

function visualChamberBlock(
  chamber: ProposalPdfChamber,
  index: number,
  total: number,
  documentTitle: string,
  companyName: string,
  buyerLabel: string,
  today: string
): string {
  const quantity = Math.max(1, Math.round(chamber.input.quantity))
  const quantityLabel = quantity > 1 ? ` · ${quantity} шт` : ''
  const title = total > 1 ? `${index + 1}. ${chamber.title}${quantityLabel}` : `${chamber.title}${quantityLabel}`
  const side3d = chamber.side3dImageDataUrl
    ? `<img class="visual-3d" src="${escapeHtml(chamber.side3dImageDataUrl)}" alt="3D-вид камеры" />`
    : buildSide3dSvg(chamber.input, chamber.result)

  return `
    <section class="visual-page">
      <header class="visual-page-head">
        <div>
          <strong>${escapeHtml(companyName)}</strong>
          <span>${documentTitle} · ${escapeHtml(title)}</span>
          <span>${escapeHtml(chamber.input.panelFilling)} ${chamber.input.thicknessMm} мм · ${chamber.result.longSideMm}×${
            chamber.result.shortSideMm
          }×${chamber.input.heightMm} мм</span>
        </div>
        <div class="right">
          <span>${buyerLabel}</span>
          <span>${today}</span>
        </div>
      </header>
      <div class="visual-grid">
        <figure class="visual-figure-3d">
          <figcaption>3D-вид</figcaption>
          ${side3d}
        </figure>
        <figure class="visual-figure-top">
          <figcaption>Вид сверху</figcaption>
          ${topViewSvg(chamber.input, chamber.result)}
        </figure>
      </div>
    </section>
  `
}

export function buildVisualsPdfHtml({ chambers, company, customer, proposal }: VisualsPdfInput): string {
  const today = new Date().toLocaleDateString('ru-RU')
  const title = proposal.number.trim() ? `Визуализации ${escapeHtml(proposal.number.trim())}` : 'Визуализации камер'
  const companyName = company.brandName || company.legalName || 'Компания'
  const buyerLabel = customer.name.trim() ? `Покупатель: ${escapeHtml(customer.name.trim())}` : 'Покупатель не указан'
  const blocks = chambers
    .map((chamber, index) => visualChamberBlock(chamber, index, chambers.length, title, companyName, buyerLabel, today))
    .join('')

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      @page { size: A4 landscape; margin: 4mm; }
      * { box-sizing: border-box; }
      html, body { width: 289mm; min-height: 202mm; }
      body { margin: 0; color: #1f2933; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.15; }
      .visual-page { height: 202mm; page-break-after: always; overflow: hidden; }
      .visual-page:last-child { page-break-after: auto; }
      .visual-page-head {
        display: flex;
        justify-content: space-between;
        gap: 8mm;
        align-items: flex-start;
        height: 12mm;
        margin: 0 0 2mm;
        color: #617083;
        overflow: hidden;
      }
      .visual-page-head strong { display: block; color: #1d6b55; font-size: 12px; line-height: 1.05; }
      .visual-page-head span { display: block; margin-top: 1mm; white-space: nowrap; }
      .visual-page-head .right { flex: 0 0 58mm; text-align: right; }
      .visual-grid { display: grid; grid-template-columns: 1fr 1.08fr; gap: 3mm; height: 188mm; }
      figure {
        position: relative;
        display: block;
        min-width: 0;
        margin: 0;
        break-inside: avoid;
        overflow: hidden;
      }
      figcaption {
        position: absolute;
        top: 2mm;
        left: 2mm;
        z-index: 2;
        margin: 0;
        padding: 1.1mm 2mm;
        border: 1px solid rgba(207, 214, 221, 0.9);
        background: rgba(255, 255, 255, 0.88);
        color: #124837;
        font-size: 11px;
        font-weight: 700;
      }
      figure img, figure svg {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 0;
        object-fit: contain;
        object-position: center center;
      }
      .visual-3d { object-fit: contain; }
    </style>
  </head>
  <body>
    ${blocks}
  </body>
</html>`
}
