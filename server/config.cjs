// Deployment choices are kept separate from business records and private environment values.
const settings = require('../src/config/platform-settings.json');
if (typeof settings.title !== 'string' || !settings.title.trim() || settings.title.length > 80) {
  throw new Error('platform-settings.json：title 须为1至80字的平台名称。');
}
if (!Array.isArray(settings.rooms) || settings.rooms.some(room => typeof room !== 'string' || !room.trim() || room.length > 40)) {
  throw new Error('platform-settings.json：rooms 须为房间名称列表。');
}
if (!['name', 'identifier'].includes(settings.loginIdentifier)) {
  throw new Error('platform-settings.json：loginIdentifier 须为 name 或 identifier。');
}
const { graduationYearStart: start, graduationYearEnd: end } = settings;
if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1900 || end > 2200 || start > end || end - start > 100) {
  throw new Error('platform-settings.json：毕业年份须为1900至2200内的连续范围，跨度不超过100年。');
}
module.exports = settings;
