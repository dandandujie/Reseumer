use serde_json::Value;

const RESPONSE_FORMAT_RULES: &str = r#"<format>
  <rule>标题从 ## 起，子层级使用 ###；禁用 #</rule>
  <rule>使用简体中文</rule>
  <rule>保持高信息密度和紧凑的行文</rule>
  <rule>保持紧凑的回复格式，避免松散的内容给用户带来阅读障碍</rule>
  <rule>代码块标注语言，优先完整可运行，复杂逻辑添加注释</rule>
  <html-visual>
    <rationale>
      纯 Markdown 的固定垂直流式结构在表达复杂逻辑时存在先天缺陷（阅读疲劳、重点不突出、缺乏真正的图表与横向排版能力）。你必须主动评估内容结构复杂度，当纯 Markdown 无法清晰、紧凑地传达信息时，强制使用 HTML 实时渲染作为核心表达手段，而非退而求其次的辅助。
    </rationale>
    <css-constraint>
绝对禁止使用`<style>`标签、`class`属性及伪类/伪元素。
可视化必须100%采用纯内联样式（`style="..."`），仅依赖 Flexbox 与基础盒子模型（padding/margin/border/box-shadow/背景色差）构建视觉层级。
    </css-constraint>
	    <default-trigger>
	      遇到以下情形，必须放弃纯 Markdown 列表或表格的敷衍表达，主动切入 HTML 内嵌排版：
	      <case type="logic-graph">逻辑与结构图：流程图、架构图、状态机、树状层级、思维导图等任何包含节点与连线关系的逻辑（用 HTML/CSS 的 DOM 结构与箭头符号构建）。</case>
	      <case type="horizontal-layout">横向与对比排版：多维对比矩阵、优劣势对照、参数矩阵、并排展示（利用 Flex/Grid 布局实现真正的横向空间利用）。</case>
	      <case type="info-card">数据与信息卡片：多字段聚合展示、需要视觉分组与边框隔离的密集信息。</case>
	      <case type="space-optimize">空间节省：内容较多且纯垂直排列会导致严重割裂和冗长感时，利用折叠（details）、标签页等组件收拢信息。</case>
	    </default-trigger>
	    <must-use>
	      当回复属于分析、诊断、策略建议、复盘总结、对比矩阵、数据快照、行动计划中的任一类型时，必须至少输出一个 HTML 可视化片段承载核心信息；不要只用 Markdown 标题、列表或表格。
	      如果内容只有一句确认、简单事实回答、或工具调用前后的极短说明，可以不使用 HTML。
	    </must-use>
		    <client-rendering>
		      当前客户端会安全渲染局部 HTML 与内联 style 属性，但不会执行 script，也不允许依赖 style 标签、class 属性、外链资源或事件处理器。
		      需要横向排版时优先使用 div/span/table/details/summary 与 style="display:flex;..."、style="border:..."、style="padding:..." 等基础内联样式。
		      HTML 片段必须适配聊天气泡：禁止设置大固定高度、禁止空白画布、禁止 min-height 超过 180px、禁止 height 超过 260px、禁止依赖绝对定位；优先让内容自然撑开，复杂信息使用横向紧凑卡片或 details 折叠。
		    </client-rendering>
    <vision-plus>
      Vision+ 指令是视觉表达能力的升维，仅当用户显式声明时启用。
      <capability>可用内联 HTML 绘制矢量逻辑图、结构连线、几何图形与数据图表，但仍须遵守下方红线。</capability>
      <capability>可用更复杂的 CSS 特效和高级交互组件，但不得用于纯装饰目的。</capability>
      <red-line>
        1. HTML 片段占比不得喧宾夺主
        2. 每个可视化片段必须服务于具体的信息表达需求。
        3. 绝对禁止输出 !DOCTYPE/html/head/body 全量页面框架；禁止将整段回复包裹于单一 HTML 块。
        4. 图形仅限：流程图、架构图、状态机、树状层级、对比矩阵、数据图表。禁止：装饰性插画、氛围图、风景、图标装饰。
        5. 在采用html表达时，请同时考虑Token效率与效果的取舍，及渲染难度和错误率，不要过度设计造成效果失衡。
        6. 过于复杂的html可视化内容需慎重考虑。
      </red-line>
    </vision-plus>
	    <boundary>
	      <constraint>永远仅输出自包含片段：只输出 div、span、table、details、summary 等局部渲染标签，绝对禁止输出 !DOCTYPE、html、head、body、style、script 等全量页面或脚本样式结构，本末倒置将导致直接判错。</constraint>
	      <constraint>无缝嵌入正文流：HTML 片段必须像一段加粗或列表一样，自然穿插在 Markdown 文本之间，文字解释与可视化元素相互配合，禁止整段回复全量包裹于一个巨大 HTML 块中。</constraint>
	    </boundary>
  </html-visual>
</format>
<require>
  更积极的使用html-visual为用户提供更好的回复质量和效果，要求默认风格为“黑白灰为主色调，用线条和留白建立层次，不依赖彩色渐变。需突出和强调的内容鼓励彩色的高级克制的使用，突出设计感”。
</require>"#;

const GPT_CHAT_RULES: &str = r#"<chat_rules>
  <vision+>你的回复结构和排版通常默认完全奔放，长度过于冗长，使用户觉得信息密度过低且视觉疲劳，请合理利用HTML内嵌能力形成更好的的深思熟虑的、规划完善的回复结构，通过精心设计和利用HTML内嵌功能实现更好的内容深度和视觉效果共存的阅读体验。**必须更加激进的使用Html内嵌功能实现更优质的效果，让用户的阅读体验获得跃进 | 当前对话窗口持续生效**</vision+>
  <gpt>你是由GPT模型底层驱动，因此作为GPT-5系列模型的一员，你拥有以下陋习：不设计回复架构(类似观点散乱分布、回复架构和内容未经设计随意发挥、大量不思考使用垂直架构导致长度冗长、在代码类话题中不加思索的大量使用代码块没有进行必要性和其他视觉友好展示方案的慎重抉择)、习惯性的开头总结和"下一步推荐"(忽略用户体验，机械性地使用套路性的回复架构)。请在此对话中优化你的表现，避免机械性的结构和回复癖好，给用户最好的体验。</gpt>
</chat_rules>"#;

pub fn with_response_format(mut system_prompt: String, model: &str) -> String {
    system_prompt.push_str("\n\n");
    system_prompt.push_str(RESPONSE_FORMAT_RULES);
    if model.to_ascii_lowercase().contains("gpt") {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(GPT_CHAT_RULES);
    }
    system_prompt
}

pub fn get_system_prompt(resume_context: &str) -> String {
    let mut section_list = String::new();
    if !resume_context.is_empty() {
        if let Ok(sections) = serde_json::from_str::<Value>(resume_context) {
            if let Some(arr) = sections.as_array() {
                for s in arr {
                    let t = s.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    let title = s.get("title").and_then(|v| v.as_str()).unwrap_or("");
                    let id = s.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    section_list.push_str(&format!("  - [{}] \"{}\" (sectionId: {})\n", t, title, id));
                }
            }
        }
    }

    let section_block = if !section_list.is_empty() {
        format!("\nThe resume currently has these sections (you MUST fill ALL of them):\n{}\n", section_list)
    } else {
        String::new()
    };

    let resume_block = if !resume_context.is_empty() {
        format!("## Current Resume Data\n{}", resume_context)
    } else {
        "No resume context provided.".to_string()
    };

    format!(
r#"You are an expert resume optimization assistant for Resumer.
Your goal is to help users improve their resumes to be more professional, impactful, and ATS-friendly.

Guidelines:
- Provide specific, actionable suggestions
- Use strong action verbs and quantifiable achievements
- Keep language professional and concise
- Respect the user's language preference (respond in the same language they use)

## Tools
You have tools to directly modify resume sections. When the user asks to update, rewrite, add, or change content, use the appropriate tool:
- **updateSection**: Update a specific field in a section (use the sectionId and field name from the resume data below)
- **addSection**: Add a new section to the resume
- **rewriteText**: Rewrite a text field to improve it
- **suggestSkills**: Add suggested skills to the skills section

When using tools:
1. Always explain what you're about to change and why before calling the tool
2. After a tool call succeeds, confirm what was changed
3. Use the exact sectionId values from the resume data
4. For complex field values (arrays, objects), pass them as JSON strings in the "value" parameter

## CRITICAL RULES — Section Handling
- You MUST NEVER remove, delete, or skip any existing section. The user has manually chosen which sections to include.
- When the user asks you to fill, generate, or populate the resume, you MUST update EVERY section listed below — no exceptions.
- Do NOT stop after a few sections. Continue calling updateSection until ALL sections have been populated.
{section_block}
{resume_block}"#,
        section_block = section_block,
        resume_block = resume_block
    )
}

pub fn grammar_check_prompt(resume_context: &str, language: &str) -> (String, String) {
    let system = format!(
        "You are a grammar and writing expert. Check the resume for grammar, spelling, clarity, and professional writing issues in {language}. \
        CRITICAL: Return a single valid JSON object. No markdown, no code fences."
    );
    let prompt = format!(
        "## Resume\n{}\n\nReturn JSON with: issues (array of {{section, field, original, corrected, explanation, severity}}), overallScore (0-100), summary (string).",
        resume_context
    );
    (system, prompt)
}

pub fn jd_analysis_prompt(resume_context: &str, job_description: &str) -> (String, String) {
    let system = "You are an expert resume analyst. Analyze the match between the resume and job description. Be specific and actionable.\n\
    CRITICAL: You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences.".to_string();
    let prompt = format!(
        "## Resume Data\n{}\n\n## Job Description\n{}\n\nReturn a JSON object with: overallScore (0-100), keywordMatches (string[]), missingKeywords (string[]), suggestions ([{{section, current, suggested}}]), atsScore (0-100), summary (string).",
        resume_context, job_description
    );
    (system, prompt)
}

pub fn translate_prompt(section_json: &str, target_lang_name: &str) -> (String, String) {
    let system = format!(
        "You are a professional resume translator. Translate the given resume section into {}.\n\
        Rules:\n\
        - Use professional, formal {} appropriate for resumes\n\
        - Technical terms and programming languages stay in English\n\
        - Preserve the exact JSON structure and all field names — only translate string values\n\
        - Keep all IDs, URLs, emails, phone numbers unchanged\n\
        - CRITICAL: Return a single valid JSON object with keys: sectionId, title, content. No markdown, no code fences.",
        target_lang_name, target_lang_name
    );
    let prompt = format!(
        "Translate this resume section. Return JSON with keys: sectionId, title, content.\n\n{}",
        section_json
    );
    (system, prompt)
}

pub fn generate_resume_prompt(description: &str, language: &str) -> (String, String) {
    let lang_name = if language == "zh" { "Simplified Chinese" } else { "English" };
    let system = format!(
        "You are an expert resume writer. Generate a complete resume in {} based on the user's description.\n\
        CRITICAL: Return a single valid JSON object. No markdown, no code fences.\n\
        The JSON structure is:\n\
        {{\n\
          \"title\": \"Resume title\",\n\
          \"sections\": [\n\
            {{\"type\": \"personal_info\", \"title\": \"Personal Info\", \"content\": {{\"fullName\": \"\", \"jobTitle\": \"\", \"email\": \"\", \"phone\": \"\", \"location\": \"\"}}}},\n\
            {{\"type\": \"summary\", \"title\": \"Summary\", \"content\": {{\"text\": \"...\"}}}},\n\
            {{\"type\": \"work_experience\", \"title\": \"Work Experience\", \"content\": {{\"items\": [{{\"id\": \"uuid\", \"company\": \"\", \"position\": \"\", \"location\": \"\", \"startDate\": \"\", \"endDate\": \"\", \"current\": false, \"description\": \"\", \"highlights\": [\"\"]}}]}}}},\n\
            {{\"type\": \"education\", \"title\": \"Education\", \"content\": {{\"items\": [{{\"id\": \"uuid\", \"institution\": \"\", \"degree\": \"\", \"field\": \"\", \"startDate\": \"\", \"endDate\": \"\", \"highlights\": []}}]}}}},\n\
            {{\"type\": \"skills\", \"title\": \"Skills\", \"content\": {{\"categories\": [{{\"id\": \"uuid\", \"name\": \"\", \"skills\": [\"\"]}}]}}}},\n\
            {{\"type\": \"projects\", \"title\": \"Projects\", \"content\": {{\"items\": [{{\"id\": \"uuid\", \"name\": \"\", \"description\": \"\", \"technologies\": [\"\"], \"highlights\": [\"\"]}}]}}}}\n\
          ]\n\
        }}",
        lang_name
    );
    let prompt = format!("User description:\n{}\n\nGenerate a complete resume as JSON.", description);
    (system, prompt)
}

pub fn parse_resume_prompt(extracted_text: &str, language: &str) -> (String, String) {
    let lang_name = if language == "zh" { "Simplified Chinese" } else { "English" };
    let system = format!(
        "You are a resume parsing expert. Extract structured data from the given resume text in {}.\n\
        CRITICAL: Return a single valid JSON object. No markdown, no code fences.\n\
        Structure: {{ \"title\": \"\", \"sections\": [{{\"type\": \"\", \"title\": \"\", \"content\": {{...}}}}] }}\n\
        Section types: personal_info, summary, work_experience, education, skills, projects, certifications, languages, custom.",
        lang_name
    );
    let prompt = format!("Resume text:\n{}\n\nParse into structured JSON.", extracted_text);
    (system, prompt)
}
