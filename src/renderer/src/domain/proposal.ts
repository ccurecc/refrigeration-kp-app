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
  const heading =
    total > 1
      ? `<h2 class="chamber-title">${index + 1}. ${escapeHtml(chamber.title)}${quantityLabel}</h2>`
      : ''

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
    <section class="chamber-block">
      ${heading}
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
  const multi = chambers.length > 1

  const chamberBlocks = chambers.map((chamber, index) => chamberBlock(chamber, index, chambers.length, detailed)).join('')

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>КП холодильная камера</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.35; }
      .topline { text-align: center; font-size: 9px; margin-bottom: 12px; }
      .header { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; margin-bottom: 14px; }
      .logo { color: #1d6b55; font-size: 28px; font-weight: 800; }
      .meta { text-align: right; font-size: 12px; }
      .meta div { margin-bottom: 5px; }
      h1 { margin: 0 0 10px; color: #f37021; font-size: 18px; text-align: center; text-transform: uppercase; }
      h2.chamber-title { margin: 14px 0 7px; font-size: 14px; color: #124837; }
      h3 { margin: 0 0 6px; font-size: 12px; }
      .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0 12px; }
      .summary div { border: 1px solid #cfd6dd; padding: 7px; min-height: 42px; }
      .summary span { display: block; color: #617083; font-size: 9px; }
      .summary strong { display: block; margin-top: 4px; color: #124837; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
      th, td { border: 1px solid #222; padding: 5px 7px; text-align: center; }
      th { background: #55bfdc; color: #fff; font-weight: 700; }
      .proposal-table th:last-child { background: #f37021; }
      .proposal-table .cell-name { text-align: left; width: 38%; }
      .proposal-table .cell-money { text-align: right; white-space: nowrap; }
      .chamber-subtotal td { background: #eef4f1; font-weight: 700; text-align: right; }
      .chamber-block { margin-bottom: 12px; page-break-inside: avoid; }
      .chamber-block + .chamber-block { page-break-before: always; }
      .cost-table { margin-top: 10px; width: 62%; margin-left: auto; }
      .cost-table td { text-align: left; }
      .cost-table td:last-child { text-align: right; font-weight: 700; white-space: nowrap; }
      .cost-table .subtotal td { background: #eef4f1; font-weight: 700; }
      .cost-table .total td { background: #f37021; color: #fff; font-size: 13px; font-weight: 800; }
      .summary-block { break-inside: avoid; page-break-inside: avoid; }
      .summary-title { margin: 16px 0 6px; font-size: 14px; }
      .drawing { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; align-items: start; margin-top: 8px; break-inside: avoid; }
      .drawing-card, .note { border: 1px solid #cfd6dd; padding: 8px; break-inside: avoid; }
      .drawing-card svg, .drawing-card .rendered { display: block; width: 100%; height: auto; object-fit: contain; }
      .side-drawing svg, .side-drawing .rendered { max-height: 300px; }
      .door-installation-note { margin: 6px 0 0; color: #617083; font-size: 10px; line-height: 1.3; }
      .equipment-photo { margin: 6px 0 0; }
      .equipment-photo img { display: block; width: 100%; max-height: 130px; object-fit: contain; }
      .equipment-photo figcaption { margin-top: 4px; color: #617083; font-size: 10px; }
      .footer { margin-top: 12px; color: #617083; font-size: 9px; break-inside: avoid; }
    </style>
  </head>
  <body>
    <div class="topline">${companyTopLine(company)}</div>
    <section class="header">
      <div class="logo">${valueOrLine(company.brandName, 'Компания')}</div>
      <div class="meta">
        <div><strong>№:</strong> ${valueOrLine(proposal.number, 'КП 001')} / ${today}</div>
        ${validUntil ? `<div><strong>Действует до:</strong> ${validUntil}</div>` : ''}
        <div><strong>Руководитель проекта:</strong> ${valueOrLine(company.managerName)}</div>
        <div><strong>Телефон:</strong> ${valueOrLine(company.phone)}</div>
        <div><strong>E-mail:</strong> ${valueOrLine(company.email)}</div>
        ${company.web.trim() ? `<div><strong>Web:</strong> ${escapeHtml(company.web.trim())}</div>` : ''}
      </div>
    </section>

    <h1>${proposalType}</h1>
    <p><strong>Покупатель:</strong> ${valueOrLine(customer.name)}, <strong>тел.:</strong> ${valueOrLine(
      customer.phone
    )}, <strong>почта:</strong> ${valueOrLine(customer.email)}${
      customer.address.trim() ? `, <strong>адрес:</strong> ${escapeHtml(customer.address.trim())}` : ''
    }</p>

    <section class="summary">
      <div><span>Камер в КП</span><strong>${chambers.length}</strong></div>
      <div><span>Режим</span><strong>${detailed ? 'Подробное' : 'Краткое'}</strong></div>
      <div><span>НДС</span><strong>${
        proposalResult.vatEnabled ? `${proposalResult.vatRatePercent}%` : 'не облагается'
      }</strong></div>
      <div><span>Итого к оплате</span><strong>${rubFormatter.format(proposalResult.total)}</strong></div>
    </section>

    ${chamberBlocks}

    <div class="summary-block">
      ${multi ? '<h2 class="summary-title">Сводная смета по камерам</h2>' : ''}
      <table class="cost-table">
        <tbody>${summaryRowsHtml(proposalResult.costRows)}</tbody>
      </table>
      <div class="footer">Расчет двери не уменьшает площадь стеновых панелей: проем вырезается в готовой стене. Все цены и состав работ действительны на дату формирования КП.</div>
    </div>
  </body>
</html>`
}

function topViewSvg(input: ChamberInput, result: ChamberResult): string {
  const model = buildTopView({
    doorWidthMm: input.doorWidthMm,
    hasPanelFloor: input.hasPanelFloor,
    longMm: result.longSideMm,
    remainderMm: result.ceilingRemainderMm,
    shortMm: result.shortSideMm,
    stripCount: result.ceilingStripCount,
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
