// The MCP server (D-060). `Copyboxx --mcp` speaks the Model Context Protocol on stdin/stdout, so Codex, Claude Code,
// Cursor and other AI tools can start it as a local tool. It does not open a window: each tool call becomes one command
// on the running app's local door (automation.rs), and the app answers it exactly as it answers the `clipbox` command
// line, including the 「允许读取秘密吗？」 question before any 秘密 leaves the app.
use serde_json::{json, Map, Value};
use std::io::{BufRead, Write};

/// Newest first; an unknown version from the tool gets the newest one we speak.
const PROTOCOL_VERSIONS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_ANSWER_BYTES: usize = 16 * 1024 * 1024;

const NOT_RUNNING: &str = "Copyboxx 没有打开，请先打开 Copyboxx 再试。(Copyboxx is not running: ask the user to open the app.)";

const INSTRUCTIONS: &str = "Copyboxx is the user's local, encrypted copy box of customer-service reply snippets (话术) and images (图片). \
Snippets have numbers like CB-0001. The Copyboxx app must be open. Reading a secret (秘密) shows a question in the app \
and waits until the user clicks 允许 (allow); if they refuse or do not answer within 45 seconds the call fails, so tell \
the user to look at Copyboxx before calling get_secret or verify_secret.";

/// Whether this launch is the MCP server rather than the app.
pub fn is_mcp_launch(args: &[String]) -> bool {
    args.iter().skip(1).any(|a| a == "--mcp")
}

struct ToolSpec {
    name: &'static str,
    action: &'static str,
    title: &'static str,
    description: &'static str,
    /// (field, description, required)
    fields: &'static [(&'static str, &'static str, bool)],
    read_only: bool,
    destructive: bool,
}

const NUMBER: (&str, &str, bool) = ("number", "Snippet number, e.g. CB-0001", true);
const REFERENCE: &str = "Secret reference, e.g. clipbox://secret/abc or clipbox://apikey/abc";
const FIELD: &str = "For an API entry with several secret fields: the field's label (e.g. Secret, Client ID) or its position counted from 1";
const FOLDER_CHOICE: &str = "Folder name (目录); must already exist; use list_snippet_folders to find standard and custom folders";

const TOOLS: &[ToolSpec] = &[
    ToolSpec { name: "copyboxx_status", action: "status", title: "Copyboxx status", description: "Check that Copyboxx is open and count its snippets.", fields: &[], read_only: true, destructive: false },
    ToolSpec {
        name: "list_snippets",
        action: "list",
        title: "List snippets",
        description: "List snippets (number, title, folder, summary). Optionally filter by folder or by a search text.",
        fields: &[("folder", "Only this folder", false), ("query", "Search text matched against number, title, summary and content", false)],
        read_only: true,
        destructive: false,
    },
    ToolSpec { name: "get_snippet", action: "get", title: "Get a snippet", description: "Get one snippet with its full English content and Chinese text.", fields: &[NUMBER], read_only: true, destructive: false },
    ToolSpec {
        name: "add_snippet",
        action: "add",
        title: "Add a snippet",
        description: "Add a new snippet. Returns its new number.",
        fields: &[
            ("title", "Short title", true),
            ("content", "The reply text that is copied (usually English)", true),
            ("summary", "One-line summary", false),
            ("folder", FOLDER_CHOICE, false),
            ("chineseText", "Chinese translation shown next to the content", false),
        ],
        read_only: false,
        destructive: false,
    },
    ToolSpec {
        name: "update_snippet",
        action: "update",
        title: "Update a snippet",
        description: "Change fields of an existing snippet; fields left out stay as they are.",
        fields: &[NUMBER, ("title", "New title", false), ("content", "New reply text", false), ("summary", "New summary", false), ("folder", FOLDER_CHOICE, false), ("chineseText", "New Chinese text", false)],
        read_only: false,
        destructive: false,
    },
    ToolSpec { name: "move_snippet", action: "move", title: "Move a snippet", description: "Move a snippet to another folder.", fields: &[NUMBER, ("folder", FOLDER_CHOICE, true)], read_only: false, destructive: false },
    ToolSpec {
        name: "delete_snippet",
        action: "delete",
        title: "Delete a snippet",
        description: "Move a snippet to the app's trash (回收站). The user can restore it there until the trash is emptied.",
        fields: &[NUMBER],
        read_only: false,
        destructive: true,
    },
    ToolSpec {
        name: "get_secret",
        action: "secret-get",
        title: "Read a secret",
        description: "Read one secret (秘密) by its reference (clipbox://secret/... or clipbox://apikey/...). The user must click 允许 in Copyboxx first.",
        fields: &[("reference", REFERENCE, true), ("field", FIELD, false)],
        read_only: true,
        destructive: false,
    },
    ToolSpec {
        name: "verify_secret",
        action: "secret-verify",
        title: "Check a secret",
        description: "Check whether a value equals a stored secret without reading it; answers match yes/no and the length of both. The user must click 允许 in Copyboxx first.",
        fields: &[("reference", REFERENCE, true), ("field", FIELD, false), ("candidate", "The value to compare", true)],
        read_only: true,
        destructive: false,
    },
    ToolSpec { name: "create_snippet_folder", action: "snippet-folder-create", title: "Create snippet folder", description: "Create a custom snippet folder with a 1–30 character name. An existing name is a no-op.", fields: &[], read_only: false, destructive: false },
    ToolSpec { name: "rename_snippet_folder", action: "snippet-folder-rename", title: "Rename snippet folder", description: "Rename an existing custom snippet folder and move its snippets to the new name. Standard folders cannot be renamed.", fields: &[], read_only: false, destructive: false },
    ToolSpec { name: "list_snippet_folders", action: "snippet-folders", title: "List snippet folders", description: "List valid snippet folders before assigning a folder.", fields: &[], read_only: true, destructive: false },
    ToolSpec { name: "get_snippets", action: "get-many", title: "Get snippets", description: "Get 1 to 100 distinct snippets with full content and updatedAt.", fields: &[], read_only: true, destructive: false },
    ToolSpec { name: "update_snippets", action: "update-many", title: "Update snippets", description: "Update 1 to 100 snippets. Each update requires the current updatedAt as expectedUpdatedAt; omitted fields stay unchanged.", fields: &[], read_only: false, destructive: false },
    ToolSpec { name: "list_images", action: "image-list", title: "List images", description: "List image metadata with optional folder/search filters and offset/limit pagination. Originals are not returned.", fields: &[], read_only: true, destructive: false },
    ToolSpec { name: "import_images", action: "image-import", title: "Import local images", description: "Import 1 to 10 local PNG, JPEG, WebP or GIF files by absolute path, up to 10 MiB each and 20 MiB total. Optional folder must already exist.", fields: &[], read_only: false, destructive: false },
    ToolSpec { name: "get_image_thumbnail", action: "image-thumbnail", title: "Get image thumbnail", description: "Return one small image preview as an MCP image block.", fields: &[], read_only: true, destructive: false },
    ToolSpec { name: "update_images", action: "image-update-many", title: "Update images", description: "Rename images or move them to an existing folder. Use null for uncategorized. Each update requires the current updatedAt as expectedUpdatedAt.", fields: &[], read_only: false, destructive: false },
    ToolSpec { name: "list_image_folders", action: "image-folders", title: "List image folders", description: "List image folder names.", fields: &[], read_only: true, destructive: false },
    ToolSpec { name: "create_image_folder", action: "image-folder-create", title: "Create image folder", description: "Create a named image folder.", fields: &[], read_only: false, destructive: false },
    ToolSpec { name: "rename_image_folder", action: "image-folder-rename", title: "Rename image folder", description: "Rename an existing image folder and move its images to the new name.", fields: &[], read_only: false, destructive: false },
];

fn object_schema(properties: Value, required: &[&str]) -> Value {
    json!({"type":"object", "properties":properties, "required":required, "additionalProperties":false})
}

fn batch_schema(items: Value, max: usize) -> Value {
    json!({"type":"array", "minItems":1, "maxItems":max, "items":items})
}

/// One schema describes both the advertised inputs and their strict runtime validation.
fn extended_schema(action: &str) -> Option<Value> {
    let text = json!({"type":"string"});
    let timestamp = json!({"type":"integer", "minimum":0, "maximum":9007199254740991_u64});
    Some(match action {
        "snippet-folders" | "image-folders" => object_schema(json!({}), &[]),
        "get-many" => {
            let mut numbers = batch_schema(text, 100);
            numbers["uniqueItems"] = json!(true);
            object_schema(json!({"numbers":numbers}), &["numbers"])
        }
        "update-many" => object_schema(json!({"updates":batch_schema(object_schema(json!({
            "number":text, "expectedUpdatedAt":timestamp, "title":text, "content":text,
            "summary":text, "folder":text, "chineseText":text
        }), &["number", "expectedUpdatedAt"]), 100)}), &["updates"]),
        "image-list" => object_schema(json!({
            "folder":text, "query":text,
            "offset":{"type":"integer", "minimum":0, "maximum":9007199254740991_u64},
            "limit":{"type":"integer", "minimum":1, "maximum":100}
        }), &[]),
        "image-import" => object_schema(json!({"files":batch_schema(object_schema(json!({
            "path":{"type":"string", "description":"Absolute path to a local image file"}, "title":text, "folder":text
        }), &["path"]), 10)}), &["files"]),
        "image-thumbnail" => object_schema(json!({"id":text}), &["id"]),
        "image-update-many" => object_schema(json!({"updates":batch_schema(object_schema(json!({
            "id":text, "expectedUpdatedAt":timestamp, "title":text, "folder":{"type":["string","null"]}
        }), &["id", "expectedUpdatedAt"]), 100)}), &["updates"]),
        "snippet-folder-create" | "image-folder-create" => object_schema(json!({"name":text}), &["name"]),
        "snippet-folder-rename" | "image-folder-rename" => object_schema(json!({"from":text,"to":text}), &["from","to"]),
        _ => return None,
    })
}

fn validate_input(value: &Value, schema: &Value, field: &str) -> Result<(), String> {
    if schema["type"] == json!(["string", "null"]) {
        return if value.is_string() || value.is_null() { Ok(()) } else { Err(format!("{field} must be text or null")) };
    }
    match schema["type"].as_str() {
        Some("object") => {
            let given = value.as_object().ok_or_else(|| format!("{field} must be an object"))?;
            let properties = schema["properties"].as_object().expect("object schema properties");
            for (key, value) in given {
                let rule = properties.get(key).ok_or_else(|| format!("{field} does not take {key}"))?;
                validate_input(value, rule, &format!("{field}.{key}"))?;
            }
            for key in schema["required"].as_array().expect("object schema required") {
                let key = key.as_str().expect("required field name");
                if !given.contains_key(key) { return Err(format!("{field} needs {key}")); }
            }
        }
        Some("array") => {
            let items = value.as_array().ok_or_else(|| format!("{field} must be an array"))?;
            let min = schema["minItems"].as_u64().unwrap_or(0) as usize;
            let max = schema["maxItems"].as_u64().unwrap_or(100) as usize;
            if items.len() < min || items.len() > max { return Err(format!("{field} must contain {min} to {max} entries")); }
            for (index, item) in items.iter().enumerate() {
                validate_input(item, &schema["items"], &format!("{field}[{index}]"))?;
                if schema["uniqueItems"] == true && items[..index].contains(item) { return Err(format!("{field} must contain distinct entries")); }
            }
        }
        Some("integer") => {
            let number = value.as_u64().ok_or_else(|| format!("{field} must be a nonnegative integer"))?;
            if number < schema["minimum"].as_u64().unwrap_or(0) || number > schema["maximum"].as_u64().unwrap_or(u64::MAX) {
                return Err(format!("{field} is outside its allowed range"));
            }
        }
        Some("string") if value.is_string() => {}
        _ => return Err(format!("{field} must be text")),
    }
    Ok(())
}

fn tool_list() -> Value {
    let tools: Vec<Value> = TOOLS
        .iter()
        .map(|tool| {
            let mut properties = Map::new();
            let mut required = Vec::new();
            for (field, description, needed) in tool.fields {
                properties.insert((*field).into(), json!({ "type": "string", "description": description }));
                if *needed {
                    required.push(json!(field));
                }
            }
            json!({
                "name": tool.name,
                "title": tool.title,
                "description": tool.description,
                "inputSchema": extended_schema(tool.action).unwrap_or_else(|| json!({ "type": "object", "properties": properties, "required": required, "additionalProperties": false })),
                "annotations": { "title": tool.title, "readOnlyHint": tool.read_only, "destructiveHint": tool.destructive, "openWorldHint": false },
            })
        })
        .collect();
    json!({ "tools": tools })
}

/// A tool call's arguments as one command for the app, or what is wrong with them.
fn command_for(name: &str, arguments: &Value) -> Result<Value, String> {
    let tool = TOOLS.iter().find(|tool| tool.name == name).ok_or_else(|| format!("Unknown tool {name}"))?;
    let empty = Map::new();
    let given = match arguments {
        Value::Null => &empty,
        Value::Object(map) => map,
        _ => return Err("arguments must be an object".into()),
    };
    if let Some(schema) = extended_schema(tool.action) {
        let input = Value::Object(given.clone());
        validate_input(&input, &schema, name)?;
        let mut command = given.clone();
        command.insert("action".into(), json!(tool.action));
        return Ok(Value::Object(command));
    }
    let mut command = Map::new();
    command.insert("action".into(), json!(tool.action));
    for (key, value) in given {
        if !tool.fields.iter().any(|(field, _, _)| field == key) {
            return Err(format!("{name} does not take {key}"));
        }
        if !value.is_string() {
            return Err(format!("{key} must be text"));
        }
        command.insert(key.clone(), value.clone());
    }
    for (field, _, needed) in tool.fields {
        if *needed && !command.contains_key(*field) {
            return Err(format!("{name} needs {field}"));
        }
    }
    if tool.action == "delete" {
        command.insert("confirmed".into(), json!(true));
    }
    Ok(Value::Object(command))
}

fn text_result(text: String, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": text }], "isError": is_error })
}

/// One MCP conversation. `ask` sends one command to the app and returns its answer (Err: the app could not be reached).
pub struct Session<A: FnMut(Value) -> Result<Value, String>> {
    ask: A,
}

impl<A: FnMut(Value) -> Result<Value, String>> Session<A> {
    pub fn new(ask: A) -> Self {
        Session { ask }
    }

    fn call_tool(&mut self, params: &Value) -> Value {
        let name = params["name"].as_str().unwrap_or("");
        let command = match command_for(name, &params["arguments"]) {
            Ok(command) => command,
            Err(message) => return text_result(message, true),
        };
        match (self.ask)(command) {
            Err(message) => text_result(message, true),
            Ok(answer) if answer["ok"] == json!(true) => {
                let mut answer = answer;
                if let Some(map) = answer.as_object_mut() {
                    map.remove("ok");
                }
                let mut image = None;
                if answer["action"] == "image-thumbnail" {
                    let preview = answer.as_object_mut().and_then(|map| map.remove("preview"));
                    match preview {
                        Some(preview) if preview["data"].is_string() && matches!(preview["mimeType"].as_str(), Some("image/png" | "image/jpeg" | "image/webp" | "image/gif")) => {
                            image = Some(json!({"type":"image", "data":preview["data"], "mimeType":preview["mimeType"]}));
                        }
                        _ => return text_result("图片预览无效".into(), true),
                    }
                }
                let mut result = text_result(serde_json::to_string(&answer).unwrap_or_default(), false);
                result["structuredContent"] = answer;
                if let Some(image) = image { result["content"].as_array_mut().unwrap().push(image); }
                result
            }
            Ok(answer) => {
                let message = answer["error"]["message"].as_str().unwrap_or("命令执行失败");
                let code = answer["error"]["code"].as_str().unwrap_or("COMMAND_FAILED");
                text_result(format!("{message} ({code})"), true)
            }
        }
    }

    /// The answer to one incoming message, or None for a notification.
    pub fn handle(&mut self, message: &Value) -> Option<Value> {
        let Some(object) = message.as_object() else {
            return Some(json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32600, "message": "Invalid request" } }));
        };
        let id = object.get("id").cloned()?;
        let params = object.get("params").cloned().unwrap_or(Value::Null);
        let result = match object.get("method").and_then(Value::as_str).unwrap_or("") {
            "initialize" => {
                let asked = params["protocolVersion"].as_str().unwrap_or("");
                let version = PROTOCOL_VERSIONS.iter().find(|v| **v == asked).unwrap_or(&PROTOCOL_VERSIONS[0]);
                json!({
                    "protocolVersion": version,
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "copyboxx", "title": "Copyboxx", "version": env!("CARGO_PKG_VERSION") },
                    "instructions": INSTRUCTIONS,
                })
            }
            "ping" => json!({}),
            "tools/list" => tool_list(),
            "tools/call" => self.call_tool(&params),
            other => {
                return Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": format!("Method not found: {other}") } }))
            }
        };
        Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
    }

    /// Answers one line of input; None when nothing is to be sent back.
    pub fn handle_line(&mut self, line: &str) -> Option<Value> {
        let line = line.trim();
        if line.is_empty() {
            return None;
        }
        match serde_json::from_str::<Value>(line) {
            Ok(message) => self.handle(&message),
            Err(_) => Some(json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": "Parse error" } })),
        }
    }
}

/// Reads the answer line the app sends back.
fn read_answer(reader: &mut impl std::io::Read) -> Result<Value, String> {
    let mut answer = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                answer.extend_from_slice(&chunk[..n]);
                if answer.contains(&b'\n') || answer.len() > MAX_ANSWER_BYTES {
                    break;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(format!("Copyboxx 连接中断：{e}")),
        }
    }
    let text = String::from_utf8_lossy(&answer);
    serde_json::from_str(text.split('\n').next().unwrap_or("").trim()).map_err(|_| "Copyboxx 返回了无效响应".into())
}

#[cfg(unix)]
fn socket_path() -> std::path::PathBuf {
    if let Ok(custom) = std::env::var("CLIPBOX_AUTOMATION_SOCKET_PATH") {
        return custom.into();
    }
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from).unwrap_or_else(|| ".".into());
    home.join("Library").join("Application Support").join("Clipbox").join("automation.sock")
}

/// Sends one command to the running app and waits for its answer.
#[cfg(unix)]
pub fn ask_app(command: Value) -> Result<Value, String> {
    use std::os::unix::net::UnixStream;
    let mut stream = UnixStream::connect(socket_path()).map_err(|_| NOT_RUNNING.to_string())?;
    // A 秘密 waits up to a minute for the person to answer.
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(75)));
    stream.write_all(format!("{command}\n").as_bytes()).map_err(|e| format!("Copyboxx 连接中断：{e}"))?;
    let _ = stream.shutdown(std::net::Shutdown::Write);
    read_answer(&mut stream)
}

#[cfg(windows)]
pub fn ask_app(command: Value) -> Result<Value, String> {
    ask_pipe(&crate::automation::default_pipe_name(), command)
}

#[cfg(windows)]
pub fn ask_pipe(name: &str, command: Value) -> Result<Value, String> {
    const ERROR_PIPE_BUSY: i32 = 231;
    let mut tries = 0;
    let mut pipe = loop {
        match std::fs::OpenOptions::new().read(true).write(true).open(name) {
            Ok(pipe) => break pipe,
            // Another program is talking to the app right now; a new pipe instance follows at once.
            Err(e) if e.raw_os_error() == Some(ERROR_PIPE_BUSY) && tries < 40 => {
                tries += 1;
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(_) => return Err(NOT_RUNNING.into()),
        }
    };
    pipe.write_all(format!("{command}\n").as_bytes()).map_err(|e| format!("Copyboxx 连接中断：{e}"))?;
    read_answer(&mut pipe)
}

#[cfg(not(any(unix, windows)))]
pub fn ask_app(_command: Value) -> Result<Value, String> {
    Err(NOT_RUNNING.into())
}

/// Runs the MCP server until the tool closes stdin.
pub fn run() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    let mut session = Session::new(ask_app);
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if let Some(answer) = session.handle_line(&line) {
            if writeln!(stdout, "{answer}").and_then(|_| stdout.flush()).is_err() {
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session_with(answers: Vec<Result<Value, String>>) -> (Session<impl FnMut(Value) -> Result<Value, String>>, std::rc::Rc<std::cell::RefCell<Vec<Value>>>) {
        let sent = std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
        let log = sent.clone();
        let mut answers = answers.into_iter();
        let session = Session::new(move |command| {
            log.borrow_mut().push(command);
            answers.next().unwrap_or(Err("no answer".into()))
        });
        (session, sent)
    }

    #[test]
    fn only_the_mcp_flag_starts_the_server() {
        let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(is_mcp_launch(&args(&["Copyboxx.exe", "--mcp"])));
        assert!(!is_mcp_launch(&args(&["Copyboxx.exe"])));
        assert!(!is_mcp_launch(&args(&["Copyboxx.exe", "--hidden"])));
        assert!(!is_mcp_launch(&args(&["--mcp"])));
    }

    #[test]
    fn initialize_agrees_on_a_version_and_tool_calls_reach_the_app() {
        let (mut session, sent) = session_with(vec![Ok(json!({ "ok": true, "action": "status", "snippetCount": 2 }))]);
        let init = session
            .handle_line(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","clientInfo":{"name":"codex-mcp-client","version":"0.1"}}}"#)
            .unwrap();
        assert_eq!(init["id"], 1);
        assert_eq!(init["result"]["protocolVersion"], "2025-03-26");
        assert_eq!(init["result"]["serverInfo"]["name"], "copyboxx");
        assert!(init["result"]["capabilities"]["tools"].is_object());
        let future = session.handle_line(r#"{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"2099-01-01"}}"#).unwrap();
        assert_eq!(future["result"]["protocolVersion"], PROTOCOL_VERSIONS[0]);
        // A notification gets no answer.
        assert!(session.handle_line(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#).is_none());
        let status = session.handle_line(r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"copyboxx_status","arguments":{}}}"#).unwrap();
        assert_eq!(status["result"]["isError"], false);
        assert!(status["result"]["content"][0]["text"].as_str().unwrap().contains("\"snippetCount\":2"));
        assert_eq!(sent.borrow()[0], json!({ "action": "status" }));
    }

    #[test]
    fn tools_are_listed_with_their_inputs() {
        let (mut session, _) = session_with(vec![]);
        let list = session.handle_line(r#"{"jsonrpc":"2.0","id":"a","method":"tools/list"}"#).unwrap();
        let tools = list["result"]["tools"].as_array().unwrap();
        let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert_eq!(&names[..9], ["copyboxx_status", "list_snippets", "get_snippet", "add_snippet", "update_snippet", "move_snippet", "delete_snippet", "get_secret", "verify_secret"]);
        assert_eq!(names.len(), 21);
        let add = &tools[3];
        assert_eq!(add["inputSchema"]["required"], json!(["title", "content"]));
        assert_eq!(add["inputSchema"]["additionalProperties"], false);
        assert_eq!(tools[6]["annotations"]["destructiveHint"], true);
        assert_eq!(tools[1]["annotations"]["readOnlyHint"], true);
        // No tool exports every secret at once.
        assert!(!names.iter().any(|n| n.contains("export")));
    }

    #[test]
    fn tool_arguments_become_the_same_commands_as_the_command_line() {
        assert_eq!(command_for("get_snippet", &json!({ "number": "CB-0001" })).unwrap(), json!({ "action": "get", "number": "CB-0001" }));
        assert_eq!(command_for("delete_snippet", &json!({ "number": "CB-0002" })).unwrap(), json!({ "action": "delete", "number": "CB-0002", "confirmed": true }));
        assert_eq!(
            command_for("verify_secret", &json!({ "reference": "clipbox://secret/x", "candidate": "abc" })).unwrap(),
            json!({ "action": "secret-verify", "reference": "clipbox://secret/x", "candidate": "abc" })
        );
        assert_eq!(
            command_for("get_secret", &json!({ "reference": "clipbox://apikey/x", "field": "Client ID" })).unwrap(),
            json!({ "action": "secret-get", "reference": "clipbox://apikey/x", "field": "Client ID" })
        );
        assert_eq!(command_for("list_snippets", &Value::Null).unwrap(), json!({ "action": "list" }));
        assert!(command_for("get_snippet", &json!({})).is_err());
        assert!(command_for("get_snippet", &json!({ "number": 1 })).is_err());
        assert!(command_for("get_snippet", &json!({ "number": "CB-0001", "confirmed": true })).is_err());
        assert!(command_for("delete_snippet", &json!({ "number": "CB-0001", "confirmed": "yes" })).is_err());
        assert!(command_for("list_snippets", &json!({ "_client": "Codex" })).is_err());
        assert!(command_for("export_secrets", &json!({})).is_err());
        assert!(command_for("add_snippet", &json!("text")).is_err());
    }

    #[test]
    fn extended_tools_validate_and_map_typed_arguments() {
        for (name, action, args) in [
            ("list_snippet_folders", "snippet-folders", json!({})),
            ("get_snippets", "get-many", json!({"numbers": ["CB-0001", "CB-0002"]})),
            ("update_snippets", "update-many", json!({"updates": [{"number":"CB-0001","expectedUpdatedAt":0,"title":"New"}]})),
            ("list_images", "image-list", json!({"offset":0,"limit":100,"folder":"Samples","query":"sky"})),
            ("import_images", "image-import", json!({"files":[{"path":std::env::temp_dir().join("example.png"),"title":"Example","folder":"Samples"}]})),
            ("get_image_thumbnail", "image-thumbnail", json!({"id":"image-1"})),
            ("update_images", "image-update-many", json!({"updates":[{"id":"image-1","expectedUpdatedAt":1,"folder":null}]})),
            ("list_image_folders", "image-folders", json!({})),
            ("create_snippet_folder", "snippet-folder-create", json!({"name":"Custom"})),
            ("rename_snippet_folder", "snippet-folder-rename", json!({"from":"Custom","to":"Renamed"})),
            ("create_image_folder", "image-folder-create", json!({"name":"Samples"})),
            ("rename_image_folder", "image-folder-rename", json!({"from":"Samples","to":"New"})),
        ] {
            let mut expected = args.clone();
            expected["action"] = json!(action);
            assert_eq!(command_for(name, &args).unwrap(), expected);
            let mut extra = args;
            extra["injected"] = json!(true);
            assert!(command_for(name, &extra).is_err(), "{name}");
        }
        // File-level path validity is reported per file by native preparation.
        assert_eq!(command_for("import_images", &json!({"files":[{"path":"relative.png"}]})).unwrap(),
            json!({"action":"image-import","files":[{"path":"relative.png"}]}));
        for (name, args) in [
            ("create_snippet_folder", json!({})),
            ("create_snippet_folder", json!({"name":1})),
            ("rename_snippet_folder", json!({"from":"Custom"})),
            ("rename_snippet_folder", json!({"from":"Custom","to":null})),
            ("get_snippets", json!({"numbers":[]})),
            ("get_snippets", json!({"numbers":["CB-0001","CB-0001"]})),
            ("get_snippets", json!({"numbers":[1]})),
            ("get_snippets", json!({"numbers": (0..101).map(|n| n.to_string()).collect::<Vec<_>>()})),
            ("update_snippets", json!({"updates":[{"number":"CB-0001","title":"New"}]})),
            ("update_snippets", json!({"updates":[{"number":"CB-0001","expectedUpdatedAt":-1}]})),
            ("update_snippets", json!({"updates":[{"number":"CB-0001","expectedUpdatedAt":1.5}]})),
            ("update_snippets", json!({"updates":[{"number":"CB-0001","expectedUpdatedAt":1,"title":null}]})),
            ("list_images", json!({"offset":-1})),
            ("list_images", json!({"limit":101})),
            ("list_images", json!({"limit":0})),
            ("list_images", json!({"offset":"1"})),
            ("import_images", json!({"files":[]})),
            ("import_images", json!({"files":[{"path":"/tmp/a.png","data":"injected"}]})),
            ("import_images", json!({"files":vec![json!({"path":"/tmp/a.png"});11]})),
            ("update_images", json!({"updates":[{"id":"x","expectedUpdatedAt":0,"folder":1}]})),
            ("get_image_thumbnail", json!({"id":1})),
        ] { assert!(command_for(name, &args).is_err(), "{name}: {args}"); }
    }

    #[test]
    fn new_schemas_describe_arrays_numbers_and_nullable_folders() {
        let list = tool_list();
        let schema = |name: &str| list["tools"].as_array().unwrap().iter().find(|t| t["name"] == name).unwrap()["inputSchema"].clone();
        assert_eq!(schema("get_snippets")["properties"]["numbers"]["maxItems"], 100);
        assert_eq!(schema("list_images")["properties"]["limit"]["type"], "integer");
        assert_eq!(schema("import_images")["properties"]["files"]["maxItems"], 10);
        assert_eq!(schema("update_images")["properties"]["updates"]["items"]["properties"]["folder"]["type"], json!(["string","null"]));
    }

    #[test]
    fn thumbnail_is_an_image_block_without_base64_in_text() {
        let (mut session, _) = session_with(vec![Ok(json!({"ok":true,"action":"image-thumbnail","id":"sample","preview":{"data":"aGVsbG8=","mimeType":"image/png"}}))]);
        let result = session.call_tool(&json!({"name":"get_image_thumbnail","arguments":{"id":"sample"}}));
        assert_eq!(result["content"][1], json!({"type":"image","data":"aGVsbG8=","mimeType":"image/png"}));
        assert!(!result["content"][0]["text"].as_str().unwrap().contains("aGVsbG8="));
        assert_eq!(result["structuredContent"]["id"], "sample");
    }

    #[test]
    fn invalid_new_inputs_never_reach_the_app_and_bad_previews_never_leak_data() {
        let (mut session, sent) = session_with(vec![
            Ok(json!({"ok":true,"action":"image-thumbnail","preview":{"data":"private-bytes","mimeType":"text/html"}})),
            Ok(json!({"ok":false,"error":{"code":"INVALID_IMAGE_IMPORT","message":"图片文件超过大小限制"}})),
        ]);
        let bad = session.call_tool(&json!({"name":"import_images","arguments":{"files":[{"path":"/tmp/a.png","data":"injected"}]}}));
        assert_eq!(bad["isError"], true);
        assert!(sent.borrow().is_empty());
        let preview = session.call_tool(&json!({"name":"get_image_thumbnail","arguments":{"id":"sample"}}));
        assert_eq!(preview["isError"], true);
        assert!(!preview.to_string().contains("private-bytes"));
        let failure = session.call_tool(&json!({"name":"import_images","arguments":{"files":[{"path":std::env::temp_dir().join("sample.png")}]}}));
        assert_eq!(failure["isError"], true);
        assert!(failure["content"][0]["text"].as_str().unwrap().contains("INVALID_IMAGE_IMPORT"));
    }

    #[test]
    fn app_refusals_and_a_closed_app_are_tool_errors() {
        let (mut session, sent) = session_with(vec![
            Ok(json!({ "ok": false, "error": { "code": "NOT_ALLOWED", "message": "Copyboxx 里没有允许这次读取" } })),
            Err(NOT_RUNNING.into()),
        ]);
        let refused = session.handle_line(r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_secret","arguments":{"reference":"clipbox://secret/x"}}}"#).unwrap();
        assert_eq!(refused["result"]["isError"], true);
        assert_eq!(refused["result"]["content"][0]["text"], "Copyboxx 里没有允许这次读取 (NOT_ALLOWED)");
        assert_eq!(sent.borrow()[0], json!({ "action": "secret-get", "reference": "clipbox://secret/x" }));
        let closed = session.handle_line(r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"copyboxx_status"}}"#).unwrap();
        assert_eq!(closed["result"]["content"][0]["text"], NOT_RUNNING);
        // Bad arguments never reach the app.
        let bad = session.handle_line(r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_snippet","arguments":{}}}"#).unwrap();
        assert_eq!(bad["result"]["isError"], true);
        assert_eq!(sent.borrow().len(), 2);
    }

    #[test]
    fn protocol_mistakes_get_protocol_errors() {
        let (mut session, _) = session_with(vec![]);
        assert_eq!(session.handle_line("not json").unwrap()["error"]["code"], -32700);
        assert_eq!(session.handle_line(r#"{"jsonrpc":"2.0","id":9,"method":"resources/list"}"#).unwrap()["error"]["code"], -32601);
        assert_eq!(session.handle_line("[1,2]").unwrap()["error"]["code"], -32600);
        assert_eq!(session.handle_line(r#"{"jsonrpc":"2.0","id":4,"method":"ping"}"#).unwrap()["result"], json!({}));
        assert!(session.handle_line("   ").is_none());
    }

    #[cfg(unix)]
    #[test]
    fn a_command_reaches_the_app_through_the_socket_and_the_answer_comes_back() {
        use std::os::unix::net::UnixListener;
        let dir = std::env::temp_dir().join(format!("clipbox-mcp-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("automation.sock");
        let listener = UnixListener::bind(&path).unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut line = String::new();
            std::io::BufReader::new(&mut stream).read_line(&mut line).unwrap();
            let command: Value = serde_json::from_str(&line).unwrap();
            stream.write_all(format!("{}\n", json!({ "ok": true, "echo": command })).as_bytes()).unwrap();
        });
        std::env::set_var("CLIPBOX_AUTOMATION_SOCKET_PATH", &path);
        let answer = ask_app(json!({ "action": "status" })).unwrap();
        server.join().unwrap();
        assert_eq!(answer["echo"], json!({ "action": "status" }));
        std::fs::remove_file(&path).unwrap();
        assert_eq!(ask_app(json!({ "action": "status" })).unwrap_err(), NOT_RUNNING);
        std::env::remove_var("CLIPBOX_AUTOMATION_SOCKET_PATH");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
