/**
 * rewrite of Inifile.cpp/Inifile.h from dolphin in Typescript
 * https://github.com/dolphin-emu/dolphin/blob/master/Source/Core/Common/IniFile.cpp
 */

import log from "electron-log";
import fs from "fs";
import readline from "readline";

/**
 * The IniFile Class, contains a Section subclass
 */
export class IniFile {
  private sections: Section[];

  public constructor() {
    this.sections = [];
  }

  /** Differs from IniFile.cpp via:
   * Instead of editing keyOut and valueOut by reference, return them */
  private parseLine(line: string): readonly [string, string] | readonly [null, null] {
    let retValueOut = "";
    let keyOut = "";

    if (line === "" || line[0] === "#") {
      return [null, null] as const;
    }

    const firstEquals = line.indexOf("=");
    if (firstEquals !== -1) {
      keyOut = line.substring(0, firstEquals).replace(/\s+/g, "");
      retValueOut = line
        .substring(firstEquals + 1)
        .replace(/\s+/g, "")
        .replace(/['"]+/g, "");
    }

    return [keyOut, retValueOut] as const;
  }

  /**Differs from IniFile.cpp by:
   * returns section object, not pointer
   */
  public getSection(sectionName: string): Section | undefined {
    const section = this.sections.find((section) => section.name === sectionName);
    return section;
  }

  /**Differs from IniFile.cpp by:
   * returns section object, not pointer
   */
  public getOrCreateSection(section_name: string): Section {
    let section = this.getSection(section_name);
    if (section === undefined) {
      section = new Section(section_name);
      this.sections.push(section);
    }
    return section;
  }

  public deleteSection(section_name: string): boolean {
    const s = this.getSection(section_name);
    if (s === undefined) {
      return false;
    }
    this.sections.splice(this.sections.indexOf(s), 1);
    return true;
  }

  public exists(section_name: string): boolean {
    return this.getSection(section_name) != undefined;
  }

  public setLines(section_name: string, lines: string[]): void {
    const section = this.getOrCreateSection(section_name);
    section.setLines(lines);
  }

  public deleteKey(section_name: string, key: string): boolean {
    const section = this.getSection(section_name);
    if (section === undefined) {
      return false;
    }
    return section.delete(key);
  }

  /**Differs from IniFile.cpp by:
   * returns keys instead of passing it by reference
   */
  public getKeys(section_name: string): string[] {
    const section = this.getSection(section_name);
    if (section === undefined) {
      return [];
    }
    return section.keysOrder;
  }

  /**Differs from IniFile.cpp by:
   * returns lines instead of passing it by reference
   */
  public getLines(section_name: string, remove_comments = false): string[] {
    const section = this.getSection(section_name);
    if (section === undefined) {
      return [];
    }

    const lines = section.getLines(remove_comments);

    return lines;
  }

  public async load(fileName: string, keep_current_data = true): Promise<boolean> {
    if (!keep_current_data) {
      this.sections = [];
    }

    const ins = fs.createReadStream(fileName);
    ins.on("error", (e) => {
      log.error("failed to read file with error", e);
    });
    const rl = readline.createInterface({
      input: ins,
      terminal: false,
    });
    let current_section = undefined;
    let first_line = true;
    for await (let line of rl) {
      //console.log(line);
      // Skips the UTF-8 BOM at the start of files. Notepad likes to add this.
      if (first_line && line.substr(0, 3) === "\xEF\xBB\xBF") {
        line = line.slice(3);
      }
      first_line = false;

      //section line
      if (line[0] === "[") {
        //console.log(line, line[0]);
        const endpos = line.indexOf("]");
        if (endpos !== -1) {
          //we have a new section
          const sub = line.substr(1, endpos - 1);
          //console.log(sub);
          current_section = this.getOrCreateSection(sub);
          //console.log(current_section);
        }
      } else {
        if (current_section !== undefined) {
          const [key, value] = this.parseLine(line);

          // Lines starting with '$', '*' or '+' are kept verbatim.
          // Kind of a hack, but the support for raw lines inside an
          // INI is a hack anyway.
          if (
            (key === null && value === null) ||
            (line.length !== 0 && ["$", "+", "*"].some((val) => line[0] === val))
          ) {
            current_section.lines.push(line);
          } else if (key !== null && value !== null) {
            current_section.set(key, value);
          }
        }
      }
    }

    return true;
  }

  public save(filePath: string): boolean {
    const out = fs.createWriteStream(filePath);

    out.on("error", (e) => {
      log.error("failed to write file with error", e);
    });

    this.sections.forEach((section) => {
      // originally section.name was only written if the section was non-empty,
      // but that goes against us wanting to always show the Gecko section
      out.write(`[${section.name}]\n`);

      if (section.keysOrder.length === 0) {
        section.lines.forEach((line) => {
          out.write(`${line}\n`);
        });
        out.write("\n");
      } else {
        section.keysOrder.forEach((kvit) => {
          const value = section.values.get(kvit);
          out.write(`${kvit}=${value}\n`);
        });
        out.write("\n");
      }
    });

    out.end();
    out.close();

    return true;
  }
}

/**
 * The Section class
 */
export class Section {
  public name: string;
  public keysOrder: string[];
  public lines: string[];
  public values: Map<string, string>;

  public constructor(name: string) {
    this.name = name;
    this.keysOrder = [];
    this.lines = [];
    this.values = new Map();
  }

  /**Differs from IniFile.cpp by:
   * passes key by value rather than address
   */
  public set(key: string, new_value: string): void {
    const newKey = !this.values.has(key);
    if (newKey) {
      this.keysOrder.push(key);
    }
    this.values.set(key, new_value);
  }

  //TODO work around pass by reference
  // no idea what default value is for
  public get(key: string, default_value: string): string {
    const value = this.values.get(key);

    if (value !== undefined) {
      return value;
    }

    return default_value;
  }

  public exists(key: string): boolean {
    return this.values.get(key) !== undefined;
  }

  public delete(key: string): boolean {
    const success = this.values.delete(key);
    if (success) {
      this.keysOrder.splice(this.keysOrder.indexOf(key), 1);
    }

    return success;
  }

  public setLines(lines: string[]): void {
    this.lines = lines;
  }

  /**Differs from IniFile.cpp by:
   * returns lines instead of passing it by reference
   */
  public getLines(remove_comments: boolean): string[] {
    const lines: string[] = [];
    this.lines.forEach((line) => {
      //let stripped_line = stripSpace(line);
      if (remove_comments) {
        const commentPos = line.indexOf("#");
        if (commentPos !== -1) {
          //stripped_line = stripped_line.substring(0, commentPos);
        }
      }
      if (line !== "\n" && line !== "") {
        lines.push(line);
      }
    });
    return lines;
  }
}
