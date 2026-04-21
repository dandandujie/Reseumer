use serde_json::Value;

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
r#"You are an expert resume optimization assistant for Reseumer.
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
- **analyzeJdMatch**: Analyze how well the resume matches a job description. Use this when the user pastes a JD or asks about job fit.
- **translateResume**: Translate the entire resume to a different language (Chinese or English). Use this when the user asks to translate their resume.

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

pub fn cover_letter_prompt(resume_context: &str, job_description: &str, tone: &str, language: &str) -> (String, String) {
    let system = format!(
        "You are an expert cover letter writer. Write a professional, compelling cover letter in {language} with a {tone} tone. \
        CRITICAL: Return a single valid JSON object with keys: coverLetter (string). No markdown, no code fences.",
    );
    let prompt = format!(
        "## Resume\n{}\n\n## Job Description\n{}\n\nWrite a cover letter and return as JSON: {{\"coverLetter\": \"...\"}}",
        resume_context, job_description
    );
    (system, prompt)
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
