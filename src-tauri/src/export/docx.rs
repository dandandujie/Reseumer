use docx_rs::{Docx, Paragraph, Run, RunFonts, LineSpacing, AlignmentType};
use serde_json::Value;
use std::path::Path;

fn gstr<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("")
}

fn garr<'a>(v: &'a Value, key: &str) -> Vec<&'a Value> {
    v.get(key).and_then(|x| x.as_array()).map(|a| a.iter().collect()).unwrap_or_default()
}

fn garr_str(v: &Value, key: &str) -> Vec<String> {
    v.get(key).and_then(|x| x.as_array()).map(|a| {
        a.iter().filter_map(|x| x.as_str().map(String::from)).collect()
    }).unwrap_or_default()
}

fn heading(text: &str) -> Paragraph {
    Paragraph::new()
        .add_run(Run::new().add_text(text).size(28).bold())
        .line_spacing(LineSpacing::new().before(120).after(60))
}

fn subheading(text: &str) -> Paragraph {
    Paragraph::new()
        .add_run(Run::new().add_text(text).size(24).bold())
        .line_spacing(LineSpacing::new().before(60).after(40))
}

fn para(text: &str) -> Paragraph {
    Paragraph::new().add_run(Run::new().add_text(text).size(20))
}

fn bullet(text: &str) -> Paragraph {
    Paragraph::new().add_run(Run::new().add_text(format!("• {}", text)).size(20))
}

pub fn generate_docx(resume_title: &str, sections: &[Value], output_path: &Path) -> Result<(), String> {
    let mut docx = Docx::new()
        .default_fonts(RunFonts::new().ascii("Arial").east_asia("SimSun"))
        .default_size(20);

    // Add title
    docx = docx.add_paragraph(
        Paragraph::new()
            .align(AlignmentType::Center)
            .add_run(Run::new().add_text(resume_title).size(36).bold())
    );

    for section in sections {
        if section.get("visible").and_then(|v| v.as_bool()) == Some(false) { continue; }
        let section_type = gstr(section, "type");
        let title = gstr(section, "title");
        let content = section.get("content").cloned().unwrap_or(Value::Null);

        match section_type {
            "personal_info" => {
                let name = gstr(&content, "fullName");
                let job = gstr(&content, "jobTitle");
                if !name.is_empty() {
                    docx = docx.add_paragraph(
                        Paragraph::new().align(AlignmentType::Center)
                            .add_run(Run::new().add_text(name).size(32).bold())
                    );
                }
                if !job.is_empty() {
                    docx = docx.add_paragraph(
                        Paragraph::new().align(AlignmentType::Center)
                            .add_run(Run::new().add_text(job).size(24).italic())
                    );
                }
                let contact_keys = ["email", "phone", "location", "website"];
                let parts: Vec<String> = contact_keys.iter()
                    .filter_map(|k| {
                        let s = gstr(&content, k);
                        if s.is_empty() { None } else { Some(s.to_string()) }
                    })
                    .collect();
                if !parts.is_empty() {
                    docx = docx.add_paragraph(
                        Paragraph::new().align(AlignmentType::Center)
                            .add_run(Run::new().add_text(parts.join(" | ")).size(20))
                    );
                }
            }
            "summary" => {
                docx = docx.add_paragraph(heading(title));
                let text = gstr(&content, "text");
                if !text.is_empty() {
                    docx = docx.add_paragraph(para(text));
                }
            }
            "work_experience" => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let pos = gstr(item, "position");
                    let company = gstr(item, "company");
                    docx = docx.add_paragraph(subheading(&format!("{} — {}", pos, company)));

                    let start = gstr(item, "startDate");
                    let end = if item.get("current").and_then(|v| v.as_bool()) == Some(true) {
                        "Present".to_string()
                    } else { gstr(item, "endDate").into() };
                    let location = gstr(item, "location");
                    let date_line = if location.is_empty() {
                        format!("{} - {}", start, end)
                    } else {
                        format!("{} - {} | {}", start, end, location)
                    };
                    docx = docx.add_paragraph(para(&date_line));

                    let desc = gstr(item, "description");
                    if !desc.is_empty() {
                        docx = docx.add_paragraph(para(desc));
                    }
                    for h in garr_str(item, "highlights") {
                        if !h.is_empty() {
                            docx = docx.add_paragraph(bullet(&h));
                        }
                    }
                }
            }
            "education" => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let degree = gstr(item, "degree");
                    let field = gstr(item, "field");
                    let inst = gstr(item, "institution");
                    docx = docx.add_paragraph(subheading(&format!("{} in {}, {}", degree, field, inst)));
                    let start = gstr(item, "startDate");
                    let end = gstr(item, "endDate");
                    docx = docx.add_paragraph(para(&format!("{} - {}", start, end)));
                    let gpa = gstr(item, "gpa");
                    if !gpa.is_empty() {
                        docx = docx.add_paragraph(para(&format!("GPA: {}", gpa)));
                    }
                }
            }
            "skills" => {
                docx = docx.add_paragraph(heading(title));
                for cat in garr(&content, "categories") {
                    let name = gstr(cat, "name");
                    let skills = garr_str(cat, "skills");
                    docx = docx.add_paragraph(para(&format!("{}: {}", name, skills.join(", "))));
                }
            }
            "projects" => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let name = gstr(item, "name");
                    docx = docx.add_paragraph(subheading(name));
                    let desc = gstr(item, "description");
                    if !desc.is_empty() {
                        docx = docx.add_paragraph(para(desc));
                    }
                    let techs = garr_str(item, "technologies");
                    if !techs.is_empty() {
                        docx = docx.add_paragraph(para(&format!("Technologies: {}", techs.join(", "))));
                    }
                    for h in garr_str(item, "highlights") {
                        if !h.is_empty() {
                            docx = docx.add_paragraph(bullet(&h));
                        }
                    }
                }
            }
            "certifications" => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let name = gstr(item, "name");
                    let issuer = gstr(item, "issuer");
                    let date = gstr(item, "date");
                    let mut line = name.to_string();
                    if !issuer.is_empty() { line.push_str(&format!(", {}", issuer)); }
                    if !date.is_empty() { line.push_str(&format!(" ({})", date)); }
                    docx = docx.add_paragraph(bullet(&line));
                }
            }
            "languages" => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let lang = gstr(item, "language");
                    let prof = gstr(item, "proficiency");
                    docx = docx.add_paragraph(bullet(&format!("{}: {}", lang, prof)));
                }
            }
            _ => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let i_title = gstr(item, "title");
                    let subtitle = gstr(item, "subtitle");
                    let head = if subtitle.is_empty() { i_title.to_string() } else { format!("{} - {}", i_title, subtitle) };
                    docx = docx.add_paragraph(subheading(&head));
                    let date = gstr(item, "date");
                    if !date.is_empty() { docx = docx.add_paragraph(para(date)); }
                    let desc = gstr(item, "description");
                    if !desc.is_empty() { docx = docx.add_paragraph(para(desc)); }
                }
            }
        }
    }

    let file = std::fs::File::create(output_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    docx.build().pack(file).map_err(|e| format!("Failed to build DOCX: {}", e))?;
    Ok(())
}
