/**
 * Compares two section objects and produces a flat list of human-friendly
 * field changes — ignoring metadata fields (id, sortOrder, createdAt, ...).
 * Used to render concise change summaries instead of raw JSON diffs.
 */
import type { ResumeSection } from '@/types/resume';

export interface FieldChange {
  /** Pretty path, e.g. "工作经历 › 字节跳动 › 职位" */
  label: string;
  before: string;
  after: string;
  kind: 'modified' | 'added' | 'removed';
}

const SKIP_KEYS = new Set([
  'id',
  'sortOrder',
  'resumeId',
  'createdAt',
  'updatedAt',
  'type',
  'visible',
]);

// English / Chinese labels for common section content fields. Anything not
// listed falls back to the raw key.
const FIELD_LABELS: Record<string, string> = {
  fullName: '姓名',
  jobTitle: '职位',
  email: '邮箱',
  phone: '电话',
  location: '地点',
  website: '网站',
  age: '年龄',
  gender: '性别',
  wechat: '微信',
  ethnicity: '民族',
  hometown: '籍贯',
  politicalStatus: '政治面貌',
  maritalStatus: '婚姻状况',
  yearsOfExperience: '工作年限',
  educationLevel: '学历',
  avatar: '头像',
  text: '正文',
  summary: '总结',
  description: '描述',
  position: '职位',
  company: '公司',
  institution: '学校',
  degree: '学位',
  field: '专业',
  major: '专业',
  startDate: '开始时间',
  endDate: '结束时间',
  current: '在职',
  highlights: '亮点',
  technologies: '技术',
  gpa: 'GPA',
  name: '名称',
  url: '链接',
  language: '语言',
  proficiency: '熟练度',
  issuer: '颁发方',
  date: '日期',
  title: '标题',
  subtitle: '副标题',
  skills: '技能',
  categories: '分类',
  items: '条目',
  stars: 'Stars',
  content: '',
};

function labelize(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function isLeaf(v: unknown): boolean {
  return v === null || v === undefined || typeof v !== 'object';
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function itemDisplayName(item: unknown): string {
  if (!item || typeof item !== 'object') return stringify(item);
  const o = item as Record<string, unknown>;
  // Heuristic: pick first present human-meaningful field
  const order = ['title', 'name', 'position', 'company', 'institution', 'language', 'text', 'description'];
  for (const k of order) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '未命名条目';
}

function walk(
  before: unknown,
  after: unknown,
  labelStack: string[],
  out: FieldChange[],
) {
  // Both null/undefined — nothing to compare.
  if (before === undefined && after === undefined) return;

  // Leaf comparison
  if (isLeaf(before) && isLeaf(after)) {
    const a = stringify(before);
    const b = stringify(after);
    if (a !== b) {
      const label = labelStack.filter(Boolean).join(' › ') || '内容';
      out.push({
        label,
        before: a,
        after: b,
        kind: !a ? 'added' : !b ? 'removed' : 'modified',
      });
    }
    return;
  }

  // Array vs array (use id-based matching when items have ids)
  if (Array.isArray(before) && Array.isArray(after)) {
    const beforeArr = before as any[];
    const afterArr = after as any[];

    const haveIds = beforeArr.every((x) => x?.id) && afterArr.every((x) => x?.id);
    if (haveIds) {
      const beforeMap = new Map<string, any>(beforeArr.map((x) => [x.id, x]));
      const afterMap = new Map<string, any>(afterArr.map((x) => [x.id, x]));
      const allIds = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);
      for (const id of allIds) {
        const b = beforeMap.get(id);
        const a = afterMap.get(id);
        if (b && !a) {
          out.push({
            label: [...labelStack, itemDisplayName(b)].filter(Boolean).join(' › '),
            before: itemDisplayName(b),
            after: '',
            kind: 'removed',
          });
        } else if (!b && a) {
          out.push({
            label: [...labelStack, itemDisplayName(a)].filter(Boolean).join(' › '),
            before: '',
            after: itemDisplayName(a),
            kind: 'added',
          });
        } else if (b && a) {
          walk(b, a, [...labelStack, itemDisplayName(a)], out);
        }
      }
      return;
    }

    // No ids — index-based comparison
    const len = Math.max(beforeArr.length, afterArr.length);
    for (let i = 0; i < len; i++) {
      walk(beforeArr[i], afterArr[i], [...labelStack, `#${i + 1}`], out);
    }
    return;
  }

  // Type mismatch — wholesale change
  if (typeof before !== typeof after) {
    const label = labelStack.filter(Boolean).join(' › ') || '内容';
    out.push({
      label,
      before: stringify(before),
      after: stringify(after),
      kind: !before ? 'added' : !after ? 'removed' : 'modified',
    });
    return;
  }

  // Object vs object
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const b = before as Record<string, unknown>;
    const a = after as Record<string, unknown>;
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    for (const k of keys) {
      if (SKIP_KEYS.has(k)) continue;
      walk(b[k], a[k], [...labelStack, labelize(k)], out);
    }
  }
}

/** Public: diff a section's title + content, returning user-readable field changes. */
export function diffSectionFields(
  before: ResumeSection,
  after: ResumeSection,
): FieldChange[] {
  const out: FieldChange[] = [];
  if (before.title !== after.title) {
    out.push({
      label: '标题',
      before: before.title,
      after: after.title,
      kind: 'modified',
    });
  }
  walk(before.content, after.content, [], out);
  return out;
}
