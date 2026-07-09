export interface CompanySettings {
  brandName: string
  legalName: string
  legalAddress: string
  inn: string
  kpp: string
  okpo: string
  managerName: string
  phone: string
  email: string
  web: string
}

export interface CustomerData {
  name: string
  phone: string
  email: string
  address: string
}

export interface ProposalSettings {
  number: string
  validUntil: string
}

export interface CatalogSettings {
  internalAnglePricePerM: number
  floorChannelPricePerM: number
  doorChannelPricePerM: number
  externalVerticalAnglePricePerM: number
  externalCeilingAnglePricePerM: number
  foamName: string
  foamNormPerM2: number
  foamPricePerUnit: number
  sealantName: string
  sealantNormPerM2: number
  sealantPricePerUnit: number
  screwsName: string
  screwsNormPerM2: number
  screwsPricePerUnit: number
  defaultDoorName: string
  defaultDoorPrice: number
  defaultDoorMountingPrice: number
  defaultEquipmentName: string
  defaultEquipmentPrice: number
  defaultEquipmentMountingPrice: number
}

export interface AppSettings {
  company: CompanySettings
  catalog: CatalogSettings
}

export const defaultCompanySettings: CompanySettings = {
  brandName: 'ИП Камышанов Александр',
  legalName: 'ИП Камышанов Александр',
  legalAddress: '',
  inn: '',
  kpp: '',
  okpo: '',
  managerName: '',
  phone: '',
  email: '',
  web: ''
}

export const defaultCustomerData: CustomerData = {
  name: '',
  phone: '',
  email: '',
  address: ''
}

export const defaultProposalSettings: ProposalSettings = {
  number: 'КП 001',
  validUntil: ''
}

export const defaultCatalogSettings: CatalogSettings = {
  internalAnglePricePerM: 0,
  floorChannelPricePerM: 0,
  doorChannelPricePerM: 0,
  externalVerticalAnglePricePerM: 0,
  externalCeilingAnglePricePerM: 0,
  foamName: 'Пена монтажная',
  foamNormPerM2: 0,
  foamPricePerUnit: 0,
  sealantName: 'Герметик',
  sealantNormPerM2: 0,
  sealantPricePerUnit: 0,
  screwsName: 'Саморезы',
  screwsNormPerM2: 0,
  screwsPricePerUnit: 0,
  defaultDoorName: 'Дверь низкотемпературная',
  defaultDoorPrice: 0,
  defaultDoorMountingPrice: 0,
  defaultEquipmentName: '',
  defaultEquipmentPrice: 0,
  defaultEquipmentMountingPrice: 0
}

export const defaultAppSettings: AppSettings = {
  company: defaultCompanySettings,
  catalog: defaultCatalogSettings
}
