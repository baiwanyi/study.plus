export const defaultExamRemark = ['语文', '数学', '英语', '试卷订正']

export const defaultSubmissionRemark = [
    '数学同步',
    '语文同步',
    '英语同步',
    '5+3练习册',
    '口算练习',
    '阅读打卡',
    '写字练习',
]

export const defaultCustomRemark = []

export const defaultQuotes = [
    '学海无涯苦作舟。',
    '书山有路勤为径。',
    '读书破万卷，下笔如有神。',
    '黑发不知勤学早，白首方悔读书迟。',
    '少壮不努力，老大徒伤悲。',
    '千里之行，始于足下。',
    '业精于勤，荒于嬉。',
    '知之者不如好之者，好之者不如乐之者。',
    '学而不思则罔，思而不学则殆。',
    '温故而知新，可以为师矣。',
    '敏而好学，不耻下问。',
    '三人行，必有我师焉。',
    '学如逆水行舟，不进则退。',
    '宝剑锋从磨砺出，梅花香自苦寒来。',
    '玉不琢，不成器；人不学，不知道。',
    '勤能补拙是良训，一分辛苦一分才。',
    '书到用时方恨少，事非经过不知难。',
    '路漫漫其修远兮，吾将上下而求索。',
    '天行健，君子以自强不息。',
    '不积跬步，无以至千里。',
    '锲而不舍，金石可镂。',
    '吾生也有涯，而知也无涯。',
    '纸上得来终觉浅，绝知此事要躬行。',
    '立身以立学为先，立学以读书为本。',
    '鸟欲高飞先振翅，人求上进先读书。',
    '莫等闲，白了少年头，空悲切。',
    '发奋识遍天下字，立志读尽人间书。',
    '读书不觉已春深，一寸光阴一寸金。',
    '旧书不厌百回读，熟读深思子自知。',
    '问渠那得清如许，为有源头活水来。',
    '三更灯火五更鸡，正是男儿读书时。',
    '富贵必从勤苦得，男儿须读五车书。',
    '粗缯大布裹生涯，腹有诗书气自华。',
    '读书之乐乐何如，绿满窗前草不除。',
    '一日不读书，胸臆无佳想。',
    '一月不读书，耳目失精爽。',
    '盛年不重来，一日难再晨。',
    '及时当勉励，岁月不待人。',
    '少年易老学难成，一寸光阴不可轻。',
    '未觉池塘春草梦，阶前梧叶已秋声。',
    '古人学问无遗力，少壮工夫老始成。',
    '板凳要坐十年冷，文章不写一句空。',
    '非学无以广才，非志无以成学。',
    '学然后知不足，教然后知困。',
    '博观而约取，厚积而薄发。',
    '读书贵能疑，疑乃可以启信。',
    '读书在有渐，渐乃克底有成。',
    '好读书，不求甚解，每有会意，便欣然忘食。',
    '奇文共欣赏，疑义相与析。',
    '读书好处心先觉，立雪深时道已传。',
    '灯火纸窗修竹里，读书声。',
    '磋砣莫遗韶光老，人生惟有读书好。',
    '书卷多情似故人，晨昏忧乐每相亲。',
    '眼前直下三千字，胸次全无一点尘。',
    '活水源流随处满，东风花柳逐时新。',
    '金鞍玉勒寻芳客，未信我庐别有春。',
    '力学如力耕，勤惰尔自知。',
    '但使书种多，会有岁稔时。',
    '韦编屡绝铁砚穿，口诵手钞那计年。',
    '不是爱书即欲死，任从人笑作书颠。',
    '读书不放一字过，闭户忽惊双鬓秋。',
    '万卷古今消永日，一窗昏晓送流年。',
    '退笔如山未足珍，读书万卷始通神。',
    '外物之味，久则可厌；读书之味，愈久愈深。',
    '鱼离水则身枯，心离书则神索。',
    '一时劝人以口，百世劝人以书。',
    '有书堆数仞，不如读盈寸。',
    '读书虽可喜，何如躬践履。',
    '读书能养气，乃为善读书。',
    '人心如良苗，得养乃滋长。',
    '苗以泉水灌，心以理义养。',
    '一日不读书，胸臆无佳想。',
    '一月不读书，耳目失精爽',
]

export const defaultHomeworkRules = [
    { grade: 'A+', points: 50 },
    { grade: 'A', points: 20 },
    { grade: 'B', points: 10 },
    { grade: 'C', points: -10 },
    { grade: 'D', points: -20 },
    { grade: 'E', points: -50 },
]

export const defaultExamRules = [
    { min: 0, max: 59, points: -50 },
    { min: 60, max: 69, points: -20 },
    { min: 70, max: 79, points: -10 },
    { min: 80, max: 89, points: 10 },
    { min: 90, max: 94, points: 20 },
    { min: 95, max: 100, points: 50 },
]

export const defaultExchangeRules = [
    {
        key: 'game',
        label: '娱乐时间',
        points: 1,
        ratio: 10,
        unit: '分钟',
    },
    {
        key: 'cash',
        label: '现金兑换',
        points: 10,
        ratio: 1,
        unit: '元',
    },
]

export const DEFAULT_WEEKLY_AI_HELPER = '费曼'

export const defaultSystemSettings = {
    pageSize: 20,
    autosaveInterval: 10,
    monthlyBasePoints: 500,
    minimumPointsForPrivileges: 100,
    advanceRepayRatio: 16,
    maxPendingAmount: 500,
}

export const defaultExchangeRuleRemarks = [
    '法定节假日不受规则限制。',
    '白天时间：8:00~21:30，周末节假日：8:00~22:30',
    '夜间时间：21:30~次日 8:00，周末节假日：22:30~次日 8:00',
    '午休时间：13:00~14:00，此时间段为禁止时间',
]

export const defaultTaskTitle = {
    mindmap: '围绕成长的思维导图',
    composition: '记一件有意义的事',
    notes: '读一本好书，写一篇读书笔记',
}

export const defaultPromptTaskTitleMindmap =
    '请为{taskGrade}学生出一道独特的思维导图题目。要求：1. 主题必须从以下10个类别中随机选择一个独特的切入点（每次必须选择不同类别，避免重复）：- 阅读感悟：书中的故事、阅读启示、人物分析、情节联想- 自然观察：季节变化、天气现象、动植物世界、环境保护- 科学探索：物理现象、化学实验、科技应用、天文知识- 社会生活：家庭温馨、校园故事、社区活动、人际交往- 文化体验：传统节日、民俗技艺、诗词歌赋、民间故事- 成长感悟：克服困难、学习新技能、友谊故事、自我认识- 艺术创作：绘画手工、音乐舞蹈、戏剧表演、创意设计- 身心健康：运动健身、心理健康、饮食习惯、作息规律- 未来想象：职业梦想、科创幻想、社会变化、环球旅行- 跨学科融合：数学在生活中、历史故事与现实、诗词中的科学2. 题目要新颖独特，避免泛泛而谈，角度要具体化3. 只返回题目文本，不要加引号或其他符号'

export const defaultPromptTaskTitleComposition =
    '请为{taskGrade}学生出一道有创意的作文题目。要求：1. 题目类型从以下形式中随机选择：命题作文、半命题作文、材料作文（需附50字以内的材料/情境）2. 主题必须从以下领域中随机选择一个独特角度：校园生活、家庭温情、自然观察、成长故事、奇思妙想、社会见闻、读书感悟、人物描写、艺术欣赏、科技探索3. 避免老套的题目（如"难忘的一件事"、"我的妈妈"等），确保题目有新鲜感4. 只返回题目文本，不要加引号或其他符号'

export const defaultPromptGenerateTitle =
    '请根据以下{taskType}内容，生成一个简洁恰当的标题（不超过15个字，只返回标题文本，不要加引号或其他符号）：{taskContent}'

export const defaultPromptTaskTitleNotes =
    '请为{taskGrade}的读书笔记作业生成一个有趣的标题，要求简洁有吸引力。'

export const defaultPromptScoreComposition =
    '请对以下{taskType}进行评分。{taskTitle}。内容：{taskContent}请按以下格式返回：1. 评分等级（A+/A/B/C/D/E）2. 百分制分数3. 评语（50字以内）4. 改进建议（1-3条）请严格按以下 JSON 格式返回：{"grade":"等级","score":分数,"comment":"评语","suggestions":["建议1","建议2"]}'

export const defaultPromptScoreNotes =
    '请对以下读书笔记进行评分，重点评估【摘抄赏析】和【写读后感】两个维度。{taskTitle}。内容：{taskContent}\n\n评分维度及权重：\n1. 【摘抄赏析】（50分）：摘抄的句子是否精炼、有代表性或有美感；赏析是否体现了学生的独立思考和个人感悟，而非简单复述或空泛套话。\n2. 【写读后感】（40分）：读后感是否有真实感受和深度思考；能否结合书中内容联系自身经历、生活或已知知识进行反思；是否有自己独特的见解，而非照搬书评。\n3. 【好词积累】（10分）：积累的好词数量是否充足，是否贴合本书内容。\n\n请按以下格式返回：\n1. 评分等级（A+/A/B/C/D/E）\n2. 百分制总分\n3. 各维度分项得分\n4. 评语（50字以内）\n5. 改进建议（1-3条，侧重摘抄赏析和读后感的提升方向）\n\n请严格按以下 JSON 格式返回：{"grade":"等级","score":分数,"detailScores":{"appreciation":分数,"reflection":分数,"words":分数},"comment":"评语","suggestions":["建议1","建议2"]}'

export const defaultPromptEvaluateStudynotes =
    '你是一位温和的辅导老师，请对学生的学习心得进行评估。学科：{subject}，课题：{topic}。学生写的：【一句话概括】{summary}【自己的例子】{example}【卡壳点】{stuckPoints}。请从以下三个维度分析：1. 知识点总结是否完整：学生概括的关键概念是否涵盖了学科核心？遗漏了什么？2. 举例是否得当：例子是否能正确说明知识点？如果例子有误，指出哪里不对。3. 卡壳点的价值：学生的卡壳点是否切中要害？应该从哪里入手解决？评分权重说明：completenessScore 满分为100分，其中【一句话概括】占70分（核心得分），【自己的例子】占15分，【卡壳点】占15分。请按此权重比例给出综合评分。要求：发现错误时明确指出"这里可能需要再想想"，并给出正确思路；发现遗漏时用提示的方式引导（"你还可以想想..."），不要直接给答案；对卡壳点给出具体、可操作的建议；语气温和鼓励，使用"你"称呼孩子；不需要评分或评级。请返回 JSON 格式：{"completenessScore":数字(0-100),"completenessComment":"评价总结的完整性","missingPoints":["遗漏点1","遗漏点2"],"errors":[{"description":"错误描述","correction":"正确的理解"}],"improvementSuggestions":["建议1","建议2"],"overallComment":"总体评语（鼓励为主）"}'

// Follow-up chat prompt — split into separate sections so the AI only sees
// the instruction relevant to the current round (avoids the old problem where
// the model saw all three rounds at once and incorrectly defaulted to summary).
export const promptStudynotesFollowUpHeader =
    '你是一位用提问测验法检验学生知识掌握程度的辅导老师。\n' +
    '学科：{subject}，课题：{topic}\n' +
    '学生心得内容：\n' +
    '- 一句话概括：{summary}\n' +
    '- 自己的例子：{example}\n' +
    '- 卡壳点：{stuckPoints}\n' +
    '\n' +
    '文本表达规范（所有回复必须遵守）：\n' +
    '- 禁止使用 HTML 标签、Markdown 格式和 LaTeX 公式\n' +
    '- 禁止使用 $$、$、\\(、\\) 等公式标记\n' +
    '- 数学符号必须用中文文字表达，例如：平方代替²、立方代替³、次方代替^、根号代替√、大于等于代替≥\n' +
    '- 分数用"几分之几"表达，如"二分之一"\n' +
    '- 化学式和特殊符号用中文描述，如"水（H2O）"、温度用"摄氏度"\n' +
    '- 禁止使用任何 HTML 实体（如 &times; &divide; &sup2; 等）\n'

// Round 1 — first call, no history yet
export const promptStudynotesFollowUpRound1 =
    '\n' +
    '现在请直接出第1道测验题。只需输出题目，格式为："第一题：题目内容"\n' +
    '\n' +
    '出题要求：\n' +
    '- 结合学生的概括、例子和卡壳点来设计题目\n' +
    '- 题目考察学生是否真正理解，不能仅靠记忆回答\n' +
    '- 每题设置1-2个小陷阱或易错点，检验学生是否真正吃透\n' +
    '- 难度适中，从基础开始\n' +
    '- 语气鼓励亲切，用"你"称呼\n' +
    '- 题目中禁止使用 HTML 符号、Markdown 和 LaTeX 公式，数学符号用中文文字表达\n'

// Rounds 2-10 — normal quiz: evaluate previous answer + ask next question
export const promptStudynotesFollowUpQuiz =
    '\n' +
    '对话历史：\n' +
    '{history}\n' +
    '\n' +
    '学生刚刚的回答：\n' +
    '"""\n' +
    '{studentAnswer}\n' +
    '"""\n' +
    '\n' +
    '请做两件事：\n' +
    '1. 先判断学生上一题的答案是否正确，简要讲解（50字以内）\n' +
    '2. 再出下一道题，格式为"第{roundNumber}题：题目内容"\n' +
    '\n' +
    '出题要求：\n' +
    '- 结合学生之前的表现和卡壳点，针对性出题\n' +
    '- 每题设置1-2个小陷阱或易错点，检验学生是否真正吃透\n' +
    '- 难度逐步递进\n' +
    '- 语气鼓励亲切，用"你"称呼\n' +
    '- 题目中禁止使用 HTML 符号、Markdown 和 LaTeX 公式，数学符号用中文文字表达\n'

// Round 11+ — all 10 questions answered, generate summary report
export const promptStudynotesFollowUpSummary =
    '\n' +
    '对话历史：\n' +
    '{history}\n' +
    '\n' +
    '学生刚刚的回答：\n' +
    '"""\n' +
    '{studentAnswer}\n' +
    '"""\n' +
    '\n' +
    '10道题已经全部回答完毕，请生成总结报告。\n' +
    '\n' +
    '必须严格按照以下格式输出，不要添加任何额外字符（如冒号、星号等）：\n' +
    '【答题统计】共10题，答对X题，答错Y题\n' +
    '【错题回顾】逐题列出：第X题-正确答案-解析（仅列出答错的题）\n' +
    '【掌握程度评分】XX分（满分100分，综合正确率和知识掌握深度评估）\n' +
    '【复习建议】针对薄弱点给1-2条具体建议\n' +
    '\n' +
    '以上所有内容禁止使用 HTML 符号、Markdown 和 LaTeX 公式，数学符号用中文文字表达。\n'

export const defaultVideoDirectory = ''
