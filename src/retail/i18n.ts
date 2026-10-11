import { text as sharedText } from "../warehouse/i18n";
import type { WarehouseKey } from "../warehouse/i18n";
import type { HomeKey } from "../home/i18n";

const en = {
  products: "Products",
  template: "Label template",
  product: "Product sticker",
  shelf: "Shelf price tag",
  sale: "Sale tag",
  saleBadge: "SALE",
  currency: "Currency",
  price: "Price",
  originalPrice: "Original price",
  unit: "Size / unit",
  note: "Short description / care",
  offer: "Offer text",
  offerHelp:
    "For example: 2 for $10 or Buy 2, get 1 free. Set checkout discounts separately in your POS.",
  templateHelp:
    "Price and product sticker templates share your paper and printer settings. Original prices and offers appear on sale tags.",
  search: "Search products",
  select: "Print this product",
  selectShown: "Select results",
  deselectShown: "Deselect results",
  selection: "selected",
  selectionHelp:
    "Preview and printing include only selected products, using their quantities. Search does not change the selection.",
  none: "No barcode / QR",
  noCode: "This template will print without a barcode or QR code.",
  codeHelp:
    "Keep existing product codes. Automatic uses EAN-13, UPC-A or EAN-8 for complete numeric codes, otherwise Code 128. QR must be selected explicitly.",
  importTitle: "Import or paste a product table",
  pasteTable: "Paste CSV / TSV or cells copied from Excel",
  decimal: "Decimal separator in imported prices",
  dot: "Dot · 12.50",
  comma: "Comma · 12,50",
  priceHelp:
    "Enter prices with a decimal point, without currency symbols or thousands separators.",
  previewImport: "Preview import",
  append: "Add to current list",
  replace: "Replace current list",
  cancel: "Cancel import",
  importCount: "products ready to import",
  emptyResults: "No matching products.",
  newProduct: "Add product",
  details: "Details & promotion",
  productName: "Product name",
  sampleName: "Organic green tea",
  retailInvalid: "This retail project is invalid.",
  retailCurrencyError:
    "Enter a three-letter currency code, such as USD, CAD or EUR.",
  retailPriceError:
    "Check the price and decimal separator. Use numbers only, without thousands separators or currency symbols.",
  retailPrecisionError:
    "This price has more decimal places than the selected currency supports. Correct it before printing.",
  retailSaleError: "The original price must be greater than the current price.",
  retailMappingError:
    "Map a product name or code column. Use each column only once.",
  retailNameError: "Enter a product name or code.",
  retailMissingPrice: "Enter a price, or offer text for a sale tag.",
  retailCodeError:
    "Check the existing barcode, including its length and check digit. Product codes will not be corrected automatically.",
  retailSavedError:
    "The saved retail project could not be opened. It has been preserved. Open a valid backup or explicitly start a new list.",
  startNew: "Start a new list",
  importHelp:
    "CSV / TSV, up to 1,000 labels. Preview and map columns before importing; existing codes keep their leading zeros.",
  replaceHelp:
    "Replacing the list can be undone. Printer and paper settings are kept.",
  currencyHelp:
    "Applies to the whole list; changing currency does not convert prices.",
};
export type RetailKey = keyof typeof en;
const zh: Record<RetailKey, string> = {
  products: "商品",
  template: "标签模板",
  product: "商品贴纸",
  shelf: "货架价签",
  sale: "促销标签",
  saleBadge: "特价",
  currency: "货币",
  price: "售价",
  originalPrice: "原价",
  unit: "规格 / 单位",
  note: "简短说明 / 养护提示",
  offer: "优惠文字",
  offerHelp: "例如：2 件 10 元、买二送一。收银优惠需另外在 POS 中设置。",
  templateHelp:
    "切换模板会保留纸张和打印机设置。原价和优惠文字显示在促销标签上。",
  search: "搜索商品",
  select: "打印此商品",
  selectShown: "选中搜索结果",
  deselectShown: "取消选中搜索结果",
  selection: "已选",
  selectionHelp:
    "预览和打印仅包含勾选的商品，并按各自数量输出。搜索不会改变勾选状态。",
  none: "不显示条码 / QR",
  noCode: "标签不打印条形码或二维码。",
  codeHelp:
    "保留已有商品编码。自动模式将完整数字编码识别为 EAN-13、UPC-A 或 EAN-8，其他编码使用 Code 128；QR 需明确选择。",
  importTitle: "导入或粘贴商品表",
  pasteTable: "粘贴 CSV / TSV 或从 Excel 复制的单元格",
  decimal: "导入价格的小数分隔符",
  dot: "点 · 12.50",
  comma: "逗号 · 12,50",
  priceHelp: "价格使用小数点，不含货币符号或千位分隔符。",
  previewImport: "预览导入",
  append: "添加到当前清单",
  replace: "替换当前清单",
  cancel: "取消导入",
  importCount: "个商品可导入",
  emptyResults: "没有匹配的商品。",
  newProduct: "添加商品",
  details: "详情与促销",
  productName: "商品名称",
  sampleName: "有机绿茶",
  retailInvalid: "零售项目数据无效。",
  retailCurrencyError: "请输入三位货币代码，例如 USD、CAD 或 CNY。",
  retailPriceError:
    "请检查价格和小数分隔符。仅输入数字，不含千位分隔符或货币符号。",
  retailPrecisionError: "价格的小数位超过所选货币支持的位数，请修正后打印。",
  retailSaleError: "原价必须高于现价。",
  retailMappingError: "请选择商品名称或编码列，同一列不能重复映射。",
  retailNameError: "请输入商品名称或编码。",
  retailMissingPrice: "请输入价格；促销标签也可填写优惠文字。",
  retailCodeError: "请检查原有条码的长度和校验位。系统不会自动修改商品编码。",
  retailSavedError:
    "无法打开已保存的零售项目，原数据已保留。请导入有效备份，或明确新建清单。",
  startNew: "新建清单",
  importHelp:
    "支持 CSV / TSV，最多 1,000 张标签。先预览并映射列，编码前导零会保留。",
  replaceHelp: "替换清单可以撤销，打印机和纸张设置保持不变。",
  currencyHelp: "整张清单使用同一种货币；切换货币不会换算价格。",
};
const hant: Record<RetailKey, string> = {
  ...zh,
  products: "商品",
  template: "標籤範本",
  product: "商品貼紙",
  shelf: "貨架價籤",
  sale: "促銷標籤",
  saleBadge: "特價",
  currency: "貨幣",
  price: "售價",
  originalPrice: "原價",
  unit: "規格 / 單位",
  note: "簡短說明 / 養護提示",
  offer: "優惠文字",
  offerHelp: "例如：2 件 10 元、買二送一。結帳優惠需另外在 POS 中設定。",
  templateHelp:
    "切換範本會保留紙張和印表機設定。原價和優惠文字顯示在促銷標籤上。",
  search: "搜尋商品",
  select: "列印此商品",
  selectShown: "選取搜尋結果",
  deselectShown: "取消選取搜尋結果",
  selection: "已選",
  selectionHelp:
    "預覽和列印僅包含勾選的商品，並按各自數量輸出。搜尋不會改變勾選狀態。",
  none: "不顯示條碼 / QR",
  noCode: "標籤不列印條碼或 QR 碼。",
  codeHelp:
    "保留既有商品編碼。自動模式將完整數字編碼識別為 EAN-13、UPC-A 或 EAN-8，其他編碼使用 Code 128；QR 需明確選取。",
  importTitle: "匯入或貼上商品表",
  pasteTable: "貼上 CSV / TSV 或從 Excel 複製的儲存格",
  decimal: "匯入價格的小數分隔符號",
  dot: "點 · 12.50",
  comma: "逗號 · 12,50",
  priceHelp: "價格使用小數點，不含貨幣符號或千位分隔符號。",
  previewImport: "預覽匯入",
  append: "加入目前清單",
  replace: "取代目前清單",
  cancel: "取消匯入",
  importCount: "個商品可匯入",
  emptyResults: "沒有符合的商品。",
  newProduct: "新增商品",
  details: "詳情與促銷",
  productName: "商品名稱",
  sampleName: "有機綠茶",
  retailInvalid: "零售專案資料無效。",
  retailCurrencyError: "請輸入三位貨幣代碼，例如 USD、CAD 或 TWD。",
  retailPriceError:
    "請檢查價格和小數分隔符號。僅輸入數字，不含千位分隔符號或貨幣符號。",
  retailPrecisionError: "價格的小數位超過所選貨幣支援的位數，請修正後列印。",
  retailSaleError: "原價必須高於現價。",
  retailMappingError: "請選擇商品名稱或編碼欄，同一欄不能重複對應。",
  retailNameError: "請輸入商品名稱或編碼。",
  retailMissingPrice: "請輸入價格；促銷標籤也可填寫優惠文字。",
  retailCodeError: "請檢查既有條碼的長度與檢查碼。系統不會自動修改商品編碼。",
  retailSavedError:
    "無法開啟已儲存的零售專案，原資料已保留。請匯入有效備份，或明確建立新清單。",
  startNew: "建立新清單",
  importHelp:
    "支援 CSV / TSV，最多 1,000 張標籤。先預覽並對應欄位，編碼前導零會保留。",
  replaceHelp: "取代清單可以復原，印表機與紙張設定保持不變。",
  currencyHelp: "整張清單使用同一種貨幣；切換貨幣不會換算價格。",
};
export const retailMessages: Record<string, Record<RetailKey, string>> = {
  en,
  "zh-Hans": zh,
  "zh-Hant": hant,
};
export function retailText(
  language: string,
  key: RetailKey | WarehouseKey | HomeKey,
): string {
  if (Object.hasOwn(en, key))
    return (retailMessages[language] ?? en)[key as RetailKey];
  return sharedText(language, key as WarehouseKey | HomeKey);
}
