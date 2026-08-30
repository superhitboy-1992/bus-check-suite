export const CHECK_ITEMS = [
  { key: 'item01', name: '按规范佩戴安全带', shortName: '安全带', desc: '未佩戴、未解安全带直接套入，刻意缠绕安全带使得安全带松弛' },
  { key: 'item02', name: '开启转向灯', shortName: '转向灯', desc: '变更车道及起步前未提前开启转向辅助灯' },
  { key: 'item03', name: '多车道未靠右行车', shortName: '靠右', desc: '优先选用公交车专用车道行车，满足行车条件优先选择右侧车道' },
  { key: 'item04', name: '违规变道', shortName: '变道', desc: '实线、单实虚线区分道，直接变道' },
  { key: 'item05', name: '进出站服务', shortName: '进出站', desc: '留意站台与车内乘客，问询是否上下车；驶离站点前，留意有无赶来乘车的乘客' },
  { key: 'item06', name: '司售服务', shortName: '司售', desc: '车厢内司售人员服务是否规范' },
  { key: 'item07', name: '共线停靠', shortName: '共线', desc: '共线站点车辆进站，三辆以上（含三辆）必须二次停靠上下客' },
  { key: 'item08', name: '压线行车', shortName: '压线', desc: '沿路边实线、虚线压线行车' },
  { key: 'item09', name: '违规驻停', shortName: '驻停', desc: '单实线、斑马线、禁区、消防通道等驻停车辆；等候信号开放时越线停车' },
  { key: 'item10', name: '紧急制动', shortName: '急刹', desc: '发生紧急制动后，问询或观察乘客情况' },
  { key: 'item11', name: '行车注意力', shortName: '注意力', desc: '是否瞌睡、分神、疲劳；方向盘握姿规范' },
  { key: 'item12', name: '礼让行人', shortName: '礼让', desc: '斑马线未礼让行人' },
  { key: 'item13', name: '屏蔽门开关', shortName: '屏蔽门', desc: '上下客车门开启不低于15秒，不关好门不起步（先关后门再关前门）' },
  { key: 'item14', name: '拒载甩站改线', shortName: '拒载', desc: '未按规定停靠站，拒载过站，改线行车' },
];

export const ITEM_KEYS = CHECK_ITEMS.map((i) => i.key);

// 原版导出的表头为旧版检查项名称，按要求照搬（含与原版一致的瑕疵）
export const EXPORT_ITEM_NAMES = [
  '按规范佩戴安全带',
  '开启转向灯',
  '平稳起步',
  '平稳靠站',
  '规范进出站',
  '匀速行驶',
  '安全跟车距离',
  '规范变道',
  '正确使用灯光',
  '禁止手持接打手机',
  '禁止与他人闲聊',
  '禁止吸烟饮食',
  '礼貌服务用语',
  '拒载甩站改线',
];

export const EXPORT_HEADER = [
  '序号',
  '线路',
  '车牌/自编号',
  '驾驶员',
  '售票员',
  '上车时间',
  '上车地点',
  '下车时间',
  '下车地点',
  ...EXPORT_ITEM_NAMES,
  '备注',
  '检查人',
  '检查日期',
];

export const BASIC_DATA_TYPES = [
  { key: 'route', label: '线路管理', itemLabel: '线路' },
  { key: 'driver', label: '驾驶员管理', itemLabel: '驾驶员' },
  { key: 'conductor', label: '售票员管理', itemLabel: '售票员' },
  { key: 'station', label: '站点管理', itemLabel: '站点' },
];

export const PICK_FIELDS = {
  route: { title: '选择线路', type: 'route' },
  driver: { title: '选择驾驶员', type: 'driver' },
  conductor: { title: '选择售票员', type: 'conductor' },
  boardLocation: { title: '选择上车站点', type: 'station' },
  alightLocation: { title: '选择下车站点', type: 'station' },
};

export const STATUS_META = {
  pass: { label: '合格' },
  fail: { label: '不合格' },
  pending: { label: '待确认' },
};

export const STORAGE_KEYS = {
  records: 'busCheck.records',
  stationRecords: 'busCheck.stationRecords',
  basicData: 'busCheck.basicData',
  version: 'busCheck.version',
  draft: 'busCheck.draft',
  stationLast: 'busCheck.stationLast',
  stationReminder: 'busCheck.stationReminder',
};

export const DATA_VERSION = 2;

export const APP_NAME = '公交检查助手';

export function emptyItems() {
  return Object.fromEntries(ITEM_KEYS.map((k) => [k, null]));
}

// ---------- 驻站检查 ----------
export const RESULT_PRESETS = ['正常', '未按规定进出站', '未打招呼', '其他问题'];
export const TICK_SEQ = ['', '√', '×'];
export const TICK_LABEL = { '': '留空', '√': '√ 正常', '×': '× 异常' };
export const STATION_RECORD_HEADER = [
  '日期', '时间', '站点', '线路', '车号', '上客', '进出站规范', '售票员招呼', '检查情况', '整改措施', '备注',
];
