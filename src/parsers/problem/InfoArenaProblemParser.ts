import { Sendable } from '../../models/Sendable';
import { TaskBuilder } from '../../models/TaskBuilder';
import { htmlToElement } from '../../utils/dom';
import { Parser } from '../Parser';

interface ProblemDetails {
  files: {
    input: string;
    output: string;
  };
  source: string;
  time: number;
  memory: number;
}

export class InfoArenaProblemParser extends Parser {
  public getMatchPatterns(): string[] {
    return ['', 'www.'].map(domain => `https://${domain}infoarena.ro/problema/*`);
  }

  public async parse(url: string, html: string): Promise<Sendable> {
    const elem = htmlToElement(html);
    const task = new TaskBuilder('InfoArena').setUrl(url);

    this.parseTitle(elem, task);
    this.parseDetails(elem, task);
    this.parseTests(html, task);

    return task.build();
  }

  private parseTitle(elem: Element, task: TaskBuilder): void {
    const titleElement = elem.querySelectorAll('h1')[1];
    if (!titleElement) {
      throw new Error('Title element not found.');
    }
    const title = titleElement.textContent.trim();
    task.setName(title);
  }

  private parseDetails(elem: Element, task: TaskBuilder): void {
    const detailsTable = elem.querySelector('table[cellspacing="0"] tbody');
    if (!detailsTable) {
      throw new Error('Details table not found.');
    }

    const cells = Array.from(detailsTable.querySelectorAll('td')).map(cell => cell.textContent.trim());
    if (cells.length < 12) {
      throw new Error('Insufficient details found in the table.');
    }

    const files = cells[1].split(', ');
    const timeLimitMatch = /(\d+(?:\.\d+)?)\s*sec/i.exec(cells[9]);
    const memoryLimitMatch = /(\d+(?:\.\d+)?)\s*KB/i.exec(cells[11]);

    const details: ProblemDetails = {
      files: {
        input: this.trimZeroWidth(files[0]),
        output: this.trimZeroWidth(files[1]),
      },
      source: cells[3],
      time: parseFloat(timeLimitMatch ? timeLimitMatch[1] : '0'),
      memory: parseInt(memoryLimitMatch ? memoryLimitMatch[1] : '0'),
    };

    const isStdin = !details.files.input.endsWith('.in');
    const isStdout = !details.files.output.endsWith('.out');

    const isInteractive = elem.querySelector('h2').textContent.startsWith('Interac');

    if (isStdin || isInteractive) {
      task.setInput({
        type: 'stdin',
      });
    } else {
      task.setInput({
        type: 'file',
        fileName: details.files.input,
      });
    }

    if (isStdout || isInteractive) {
      task.setOutput({
        type: 'stdout',
      });
    } else {
      task.setOutput({
        type: 'file',
        fileName: details.files.output,
      });
    }

    task.setInteractive(isInteractive);
    task.setCategory(details.source);
    task.setTimeLimit(details.time * 1000);

    // This is because it seems like competitive-companion can't handle decimal
    // numbers in the memory limit (512 KB, for example), so I am just rounding
    // it up and hoping for the best. It would've been great if the memory limit
    // was in KB, not MB, but it doesn't matter.
    task.setMemoryLimit(Math.ceil(details.memory / 1024.0));
  }

  public parseTests(html: string, task: TaskBuilder): void {
    const elem = htmlToElement(html);

    const exampleTable = elem.querySelector('h2 + table.example');
    if (!exampleTable) {
      throw new Error('Example table not found.');
    }

    const rows = exampleTable.querySelectorAll('tbody tr');
    if (rows.length === 0) {
      throw new Error('No test cases found in the example table.');
    }

    const isInteractive = elem.querySelector('h2').textContent.startsWith('Interac');

    // Interactive problems need a bit more care, since the examples alternate
    // between stdin and stdout
    let input = '';
    let output = '';
    const thCells = Array.from(rows[0].querySelectorAll('th')).map(cell => this.trimZeroWidth(cell.textContent));
    const isStdinFirst = thCells[0] === 'stdin';

    if (isInteractive) {
      for (let i = 1; i < rows.length; ++i) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length >= 2) {
          const leftText = this.trimZeroWidth(cells[0].textContent);
          const rightText = this.trimZeroWidth(cells[1].textContent);
          input += leftText + '\n';
          output += rightText + '\n';
        }
      }
      input = input.replaceAll(/\n\n/g, '\n');
      output = output.replaceAll(/\n\n/g, '\n');
      task.addTest(isStdinFirst ? input : output, isStdinFirst ? output : input);
    } else {
      for (let i = 1; i < rows.length; ++i) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length >= 2) {
          const leftText = this.trimZeroWidth(cells[0].textContent);
          const rightText = this.trimZeroWidth(cells[1].textContent);

          task.addTest(leftText, rightText);
        }
      }
    }
  }

  private trimZeroWidth(text: string): string {
    return text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  }
}
