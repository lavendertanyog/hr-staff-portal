// Mandarin for sentences the server writes with names, dates and amounts filled in (notifications and
// the Inbox feed). Exact-text entries live in zh.js; these match by shape. Drafted, not yet reviewed
// by a native speaker.

const MONTH_NUMBERS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

// "17 Nov 2026" as "2026年11月17日"; anything else is returned as it came.
export function convertDate(text) {
  const m = typeof text === 'string' && text.match(/^(\d{1,2}) ([A-Za-z]{3,4}) (\d{4})$/);
  const month = m && MONTH_NUMBERS[m[2].toLowerCase()];
  return month ? `${m[3]}年${month}月${Number(m[1])}日` : text;
}

const LEAVE_TYPES = { annual: '年假', emergency: '紧急假', sick: '病假' };
const leaveType = (word) => LEAVE_TYPES[String(word).toLowerCase()] || word;
const STATUS_WORDS = { 'Pending manager approval': '等待经理批准', Approved: '已批准', Rejected: '已拒绝' };

export const PATTERNS = [
  [/^You have just requested for additional hours of (.+)hrs for project (\S+)\. It will be reviewed by your manager and account manager\.$/,
    (m) => `您刚刚为项目 ${m[2]} 申请了 ${m[1]} 小时的额外工时，将由您的经理和客户经理审核。`],
  [/^You have just submitted an? (\w+) leave request from (.+) to (.+)\. It is pending manager review\.$/,
    (m) => `您刚刚提交了${leaveType(m[1])}申请（${convertDate(m[2])} 至 ${convertDate(m[3])}），正在等待经理审核。`],
  [/^Your leave request has been re-reviewed and is now (approved|rejected)(?:: ([\s\S]*)|\.)$/,
    (m) => `您的休假申请已重新审核，现在为${m[1] === 'approved' ? '已批准' : '已拒绝'}${m[2] ? `：${m[2]}` : '。'}`],
  [/^(\w+) • (.+) → (.+) • Back to pending manager review\.$/,
    (m) => `${leaveType(m[1])} • ${convertDate(m[2])} → ${convertDate(m[3])} • 已退回，等待经理重新审核。`],
  [/^(\w+) • (.+) → (.+) • (Approved|Rejected)(?:\n(Note|Reason): ([\s\S]*))?$/,
    (m) => `${leaveType(m[1])} • ${convertDate(m[2])} → ${convertDate(m[3])} • ${STATUS_WORDS[m[4]]}${m[5] ? `\n${m[5] === 'Note' ? '备注' : '原因'}：${m[6]}` : ''}`],
  [/^Your request for additional hours of (.+)hrs for project (\S+) is back to pending manager review\.$/,
    (m) => `您为项目 ${m[2]} 申请 ${m[1]} 小时额外工时的请求已退回，等待经理重新审核。`],
  [/^Your request for additional hours of (.+)hrs for project (\S+) has been fully approved!$/,
    (m) => `您为项目 ${m[2]} 申请 ${m[1]} 小时额外工时的请求已最终批准！`],
  [/^Your request for additional hours of (.+)hrs for project (\S+) has been fully approved \(no Account Manager is assigned to this project\)\.$/,
    (m) => `您为项目 ${m[2]} 申请 ${m[1]} 小时额外工时的请求已最终批准（此项目没有指定客户经理）。`],
  [/^Your request for additional hours for project (\S+) has been rejected by the Account Manager\.$/,
    (m) => `您为项目 ${m[1]} 申请额外工时的请求已被客户经理拒绝。`],
  // Inbox feed lines built from leave and budget records
  [/^(\w+) leave • (.+) → (.+) • (Pending manager approval|Approved|Rejected)$/,
    (m) => `${leaveType(m[1])} • ${convertDate(m[2])} → ${convertDate(m[3])} • ${STATUS_WORDS[m[4]]}`],
  [/^(\S+) • ([\d.]+) hrs$/, (m) => `${m[1]} • ${m[2]} 小时`],
];
