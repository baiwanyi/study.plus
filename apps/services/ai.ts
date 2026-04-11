const DEEPSEEK_BASE_URL: string = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_API_KEY: string | undefined = process.env.DEEPSEEK_API_KEY;

export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E';

export interface AIScoreResult {
  grade: Grade;
  score: number;
  comment: string;
  suggestions: string[];
}

interface DeepSeekMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface DeepSeekUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: DeepSeekUsage;
}

interface DeepSeekParsedResult {
  grade: string;
  score: number | string;
  comment: string;
  suggestions: string[];
}

const VALID_GRADES: Grade[] = ['A+', 'A', 'B', 'C', 'D', 'E'];

async function logAiUsage(project: string, usage: DeepSeekUsage | undefined, taskTitle?: string, taskId?: number): Promise<void> {
  if (!usage) return;
  try {
    const { db } = await import('@apps/db/index');
    const { aiUsageLogs } = await import('@apps/db/schema');
    await db.insert(aiUsageLogs).values({
      project,
      taskId: taskId ?? null,
      taskTitle: taskTitle ?? null,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
    });
  } catch (err) {
    console.error('Failed to log AI usage:', err);
  }
}

export async function generateTitle(content: string, type: 'composition' | 'mindmap' = 'composition', taskTitle?: string, taskId?: number): Promise<string> {
  if (!DEEPSEEK_API_KEY) {
    return type === 'mindmap' ? '未命名思维导图' : '未命名作文';
  }

  const typeLabel = type === 'mindmap' ? '思维导图' : '作文';
  const prompt = `请根据以下${typeLabel}内容，生成一个简洁恰当的标题（不超过15个字，只返回标题文本，不要加引号或其他符号）：\n\n${content.slice(0, 2000)}`;

  try {
    const response: Response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt } as DeepSeekMessage],
        temperature: 0.7,
        max_tokens: 50,
      }),
    });

    const data: DeepSeekResponse = await response.json() as DeepSeekResponse;
    const rawContent: string | undefined = data.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error('Empty response from DeepSeek');

    await logAiUsage('ai-title', data.usage, taskTitle, taskId);

    return rawContent.trim().replace(/^["'"」「『』]|["'"」「『』]$/g, '');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('AI title generation error:', message);
    return type === 'mindmap' ? '未命名思维导图' : '未命名作文';
  }
}

export async function scoreComposition(
  content: string,
  title?: string,
  type: 'composition' | 'mindmap' = 'composition',
  taskId?: number
): Promise<AIScoreResult> {
  if (!DEEPSEEK_API_KEY) {
    return {
      grade: 'B',
      score: 75,
      comment: 'AI 评分未配置，默认评分为 B',
      suggestions: ['请配置 DEEPSEEK_API_KEY 以启用 AI 评分'],
    };
  }

  const typeLabel: string = type === 'mindmap' ? '思维导图' : '作文';
  const prompt: string = title
    ? `请对以下${typeLabel}进行评分。题目：${title}\n\n内容：\n${content}\n\n请按以下格式返回：\n1. 评分等级（A+/A/B/C/D/E，E为未完成）\n2. 百分制分数\n3. 评语（50字以内）\n4. 改进建议（1-3条）\n\n请严格按以下 JSON 格式返回：\n{"grade":"等级","score":分数,"comment":"评语","suggestions":["建议1","建议2"]}`
    : `请对以下${typeLabel}进行评分，无指定题目，请根据内容评判。\n\n内容：\n${content}\n\n请按以下格式返回：\n1. 评分等级（A+/A/B/C/D/E，E为未完成）\n2. 百分制分数\n3. 评语（50字以内）\n4. 改进建议（1-3条）\n\n请严格按以下 JSON 格式返回：\n{"grade":"等级","score":分数,"comment":"评语","suggestions":["建议1","建议2"]}`;

  try {
    const response: Response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt } as DeepSeekMessage],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    const data: DeepSeekResponse = await response.json() as DeepSeekResponse;
    const rawContent: string | undefined = data.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error('Empty response from DeepSeek');

    await logAiUsage('ai-score', data.usage, title, taskId);

    const result: DeepSeekParsedResult = JSON.parse(rawContent) as DeepSeekParsedResult;
    const grade: Grade = VALID_GRADES.includes(result.grade as Grade) ? (result.grade as Grade) : 'B';

    return {
      grade,
      score: Number(result.score) || 75,
      comment: result.comment || '',
      suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
    };
  } catch (error: unknown) {
    const message: string = error instanceof Error ? error.message : String(error);
    console.error('AI scoring error:', message);
    return {
      grade: 'B',
      score: 75,
      comment: `AI 评分出错：${message}`,
      suggestions: ['请稍后重试'],
    };
  }
}
