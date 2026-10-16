import { Injectable } from '@angular/core';

export interface HighlightedLine {
  lineNum: number;
  html: string;
  raw: string;
}

@Injectable({ providedIn: 'root' })
export class SyntaxHighlighterService {
  /**
   * Highlights a JSON string with syntax-colored HTML spans.
   */
  highlightJson(jsonString: string): string {
    if (!jsonString) return '';

    // First escape HTML
    const escaped = this.escapeHtml(jsonString);

    // Regex to match JSON strings (keys vs values), booleans, null, numbers, punctuation
    return escaped.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|([{}[\],:]))/g,
      (match, _p1, _p2, _p3, _p4, p5) => {
        if (p5) {
          return `<span class="json-punct">${match}</span>`;
        }
        if (/^"/.test(match)) {
          if (/:$/.test(match.trim())) {
            // It's a key
            const colonIdx = match.lastIndexOf(':');
            const keyPart = match.substring(0, colonIdx);
            const colonPart = match.substring(colonIdx);
            return `<span class="json-key">${keyPart}</span><span class="json-punct">${colonPart}</span>`;
          }
          return `<span class="json-string">${match}</span>`;
        }
        if (/true|false/.test(match)) {
          return `<span class="json-boolean">${match}</span>`;
        }
        if (/null/.test(match)) {
          return `<span class="json-null">${match}</span>`;
        }
        return `<span class="json-number">${match}</span>`;
      }
    );
  }

  /**
   * Highlights Java / BeanShell source code for connector rules with full lexer tokenization.
   */
  highlightJava(codeString: string): string {
    if (!codeString) return '';
    const inComment = { value: false };
    const rawLines = codeString.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    return rawLines.map((line) => this.highlightJavaLine(line, inComment)).join('\n');
  }

  /**
   * Tokenizes a single line of Java/BeanShell code into HTML spans with stateful multiline block comment awareness.
   */
  highlightJavaLine(line: string, inComment: { value: boolean }): string {
    if (!line) return '';

    let result = '';
    let startIdx = 0;

    // Handle ongoing multiline block comment
    if (inComment.value) {
      const endCommentIdx = line.indexOf('*/');
      if (endCommentIdx === -1) {
        return `<span class="code-comment">${this.escapeHtml(line)}</span>`;
      }
      const commentSlice = line.substring(0, endCommentIdx + 2);
      result += `<span class="code-comment">${this.escapeHtml(commentSlice)}</span>`;
      startIdx = endCommentIdx + 2;
      inComment.value = false;
    }

    const target = line.substring(startIdx);
    if (!target) return result;

    // Comprehensive Java / BeanShell token regex:
    // 1: Block comment (/*...*/ or unclosed /*...)
    // 2: Single-line comment (//...)
    // 3: String literal ("...")
    // 4: Char literal ('...')
    // 5: Annotation (@Word)
    // 6: Keyword
    // 7: Boolean or Null
    // 8: SailPoint Variable
    // 9: Type / Class
    // 10: Number
    // 11: Method invocation
    const JAVA_TOKEN_REGEX =
      /(\/\*[\s\S]*?(?:\*\/|$))|(\/\/[^\r\n]*)|("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(@[a-zA-Z_]\w*)|\b(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while)\b|\b(true|false|null)\b|\b(log|context|application|schema|result|connection|rawResponseObject|processedResponseObject|restClient|plan|identity|identityName|accountRequest|attributeRequest)\b|\b(String|Map|HashMap|List|ArrayList|Set|HashSet|Collection|Iterator|Entry|Integer|Boolean|Long|Double|Float|Byte|Short|Character|Object|Class|Exception|Throwable|GeneralException|SailPointException|SailPointContext|SailPointObject|Application|Identity|Bundle|Custom|TaskResult|QueryOptions|Filter|Attributes|ProvisioningPlan|AccountRequest|AttributeRequest|Permission|Schema|ResultSet|Connection|PreparedStatement|Statement|JsonUtil|Util|Message|Date|Calendar|SimpleDateFormat|Pattern|Matcher|StringBuilder|StringBuffer|Log|Logger|JDBCConnector|Connector)\b|\b(0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDlL]?)\b|\b([a-zA-Z_]\w*)(?=\s*\()/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = JAVA_TOKEN_REGEX.exec(target)) !== null) {
      if (match.index > lastIndex) {
        result += this.escapeHtml(target.substring(lastIndex, match.index));
      }

      const rawMatch = match[0];

      if (match[1]) {
        if (!rawMatch.endsWith('*/')) {
          inComment.value = true;
        }
        result += `<span class="code-comment">${this.escapeHtml(rawMatch)}</span>`;
      } else if (match[2]) {
        result += `<span class="code-comment">${this.escapeHtml(rawMatch)}</span>`;
      } else if (match[3] || match[4]) {
        result += `<span class="code-string">${this.escapeHtml(rawMatch)}</span>`;
      } else if (match[5]) {
        result += `<span class="code-annotation">${this.escapeHtml(rawMatch)}</span>`;
      } else if (match[6]) {
        result += `<span class="code-keyword">${this.escapeHtml(rawMatch)}</span>`;
      } else if (match[7]) {
        result += `<span class="code-boolean">${this.escapeHtml(rawMatch)}</span>`;
      } else if (match[8]) {
        result += `<span class="code-variable">${this.escapeHtml(rawMatch)}</span>`;
      } else if (match[9]) {
        result += `<span class="code-type">${this.escapeHtml(rawMatch)}</span>`;
      } else if (match[10]) {
        result += `<span class="code-number">${this.escapeHtml(rawMatch)}</span>`;
      } else if (match[11]) {
        result += `<span class="code-method">${this.escapeHtml(rawMatch)}</span>`;
      }

      lastIndex = JAVA_TOKEN_REGEX.lastIndex;
    }

    if (lastIndex < target.length) {
      result += this.escapeHtml(target.substring(lastIndex));
    }

    return result;
  }

  /**
   * Breaks highlighted text into structured lines for line-numbered viewers.
   */
  highlightToLines(text: string, language: 'json' | 'java'): HighlightedLine[] {
    const rawLines = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const inComment = { value: false };

    return rawLines.map((raw, idx) => {
      let html = '';
      if (language === 'json') {
        html = this.highlightJson(raw);
      } else {
        html = this.highlightJavaLine(raw, inComment);
      }
      return {
        lineNum: idx + 1,
        html: html || '&nbsp;',
        raw,
      };
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
