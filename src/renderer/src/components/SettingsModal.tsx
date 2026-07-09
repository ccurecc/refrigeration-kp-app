import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { CatalogSettings, CompanySettings } from '@renderer/domain/proposalData'
import { NumberField } from './NumberField'

interface SettingsModalProps {
  open: boolean
  company: CompanySettings
  catalog: CatalogSettings
  onClose: () => void
  onCompanyChange: <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => void
  onCatalogChange: <K extends keyof CatalogSettings>(key: K, value: CatalogSettings[K]) => void
}

function numberField(value: number, onChange: (value: number) => void): JSX.Element {
  return <NumberField value={value} onChange={onChange} min={0} />
}

export function SettingsModal({
  open,
  company,
  catalog,
  onClose,
  onCompanyChange,
  onCatalogChange
}: SettingsModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) {
      return undefined
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Настройки" onClick={onClose}>
      <div className="modal-window" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>Настройки</h2>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <section className="settings-group">
            <h3>Реквизиты компании</h3>
            <p className="hint-text">Подставляются в шапку PDF. Сохраняются автоматически.</p>
            <div className="field-grid two-columns">
              <label>
                Название в шапке
                <input value={company.brandName} onChange={(event) => onCompanyChange('brandName', event.target.value)} />
              </label>
              <label>
                Юр. название
                <input value={company.legalName} onChange={(event) => onCompanyChange('legalName', event.target.value)} />
              </label>
              <label>
                Руководитель проекта
                <input value={company.managerName} onChange={(event) => onCompanyChange('managerName', event.target.value)} />
              </label>
              <label>
                Телефон
                <input value={company.phone} onChange={(event) => onCompanyChange('phone', event.target.value)} />
              </label>
              <label>
                E-mail
                <input value={company.email} onChange={(event) => onCompanyChange('email', event.target.value)} />
              </label>
              <label>
                Web
                <input value={company.web} onChange={(event) => onCompanyChange('web', event.target.value)} />
              </label>
              <label>
                ИНН
                <input value={company.inn} onChange={(event) => onCompanyChange('inn', event.target.value)} />
              </label>
              <label>
                КПП
                <input value={company.kpp} onChange={(event) => onCompanyChange('kpp', event.target.value)} />
              </label>
            </div>
            <label>
              Юр. адрес
              <input value={company.legalAddress} onChange={(event) => onCompanyChange('legalAddress', event.target.value)} />
            </label>
            <label>
              Код ОКПО
              <input value={company.okpo} onChange={(event) => onCompanyChange('okpo', event.target.value)} />
            </label>
          </section>

          <section className="settings-group">
            <h3>Справочник цен — профили (руб/м)</h3>
            <div className="field-grid two-columns">
              <label>
                Внутренний угол 40×40
                {numberField(catalog.internalAnglePricePerM, (value) => onCatalogChange('internalAnglePricePerM', value))}
              </label>
              <label>
                Швеллер пола
                {numberField(catalog.floorChannelPricePerM, (value) => onCatalogChange('floorChannelPricePerM', value))}
              </label>
              <label>
                Швеллер проёма
                {numberField(catalog.doorChannelPricePerM, (value) => onCatalogChange('doorChannelPricePerM', value))}
              </label>
              <label>
                Наружный вертикальный угол
                {numberField(catalog.externalVerticalAnglePricePerM, (value) =>
                  onCatalogChange('externalVerticalAnglePricePerM', value)
                )}
              </label>
              <label>
                Наружный потолочный угол
                {numberField(catalog.externalCeilingAnglePricePerM, (value) =>
                  onCatalogChange('externalCeilingAnglePricePerM', value)
                )}
              </label>
            </div>
          </section>

          <section className="settings-group">
            <h3>Справочник расходников</h3>
            <div className="field-grid three-columns">
              <label>
                Пена — название
                <input value={catalog.foamName} onChange={(event) => onCatalogChange('foamName', event.target.value)} />
              </label>
              <label>
                Норма на м²
                {numberField(catalog.foamNormPerM2, (value) => onCatalogChange('foamNormPerM2', value))}
              </label>
              <label>
                Цена, руб/шт
                {numberField(catalog.foamPricePerUnit, (value) => onCatalogChange('foamPricePerUnit', value))}
              </label>
              <label>
                Герметик — название
                <input value={catalog.sealantName} onChange={(event) => onCatalogChange('sealantName', event.target.value)} />
              </label>
              <label>
                Норма на м²
                {numberField(catalog.sealantNormPerM2, (value) => onCatalogChange('sealantNormPerM2', value))}
              </label>
              <label>
                Цена, руб/шт
                {numberField(catalog.sealantPricePerUnit, (value) => onCatalogChange('sealantPricePerUnit', value))}
              </label>
              <label>
                Саморезы — название
                <input value={catalog.screwsName} onChange={(event) => onCatalogChange('screwsName', event.target.value)} />
              </label>
              <label>
                Норма на м²
                {numberField(catalog.screwsNormPerM2, (value) => onCatalogChange('screwsNormPerM2', value))}
              </label>
              <label>
                Цена, руб/шт
                {numberField(catalog.screwsPricePerUnit, (value) => onCatalogChange('screwsPricePerUnit', value))}
              </label>
            </div>
          </section>

          <section className="settings-group">
            <h3>Значения по умолчанию — дверь и оборудование</h3>
            <div className="field-grid two-columns">
              <label>
                Дверь по умолчанию
                <input value={catalog.defaultDoorName} onChange={(event) => onCatalogChange('defaultDoorName', event.target.value)} />
              </label>
              <label>
                Цена двери
                {numberField(catalog.defaultDoorPrice, (value) => onCatalogChange('defaultDoorPrice', value))}
              </label>
              <label>
                Монтаж двери
                {numberField(catalog.defaultDoorMountingPrice, (value) => onCatalogChange('defaultDoorMountingPrice', value))}
              </label>
              <label>
                Оборудование по умолчанию
                <input
                  value={catalog.defaultEquipmentName}
                  onChange={(event) => onCatalogChange('defaultEquipmentName', event.target.value)}
                />
              </label>
              <label>
                Цена оборудования
                {numberField(catalog.defaultEquipmentPrice, (value) => onCatalogChange('defaultEquipmentPrice', value))}
              </label>
              <label>
                Монтаж оборудования
                {numberField(catalog.defaultEquipmentMountingPrice, (value) =>
                  onCatalogChange('defaultEquipmentMountingPrice', value)
                )}
              </label>
            </div>
          </section>
        </div>

        <footer className="modal-footer">
          <button className="primary-button" type="button" onClick={onClose}>
            Готово
          </button>
        </footer>
      </div>
    </div>
  )
}
