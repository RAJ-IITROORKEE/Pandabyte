import re

QUESTION = re.compile(r'^(?:Which MCU does (?:the )?([A-Za-z0-9][A-Za-z0-9 _.-]{0,99}?) (?:listing name|use)|What microcontroller does (?:the )?([A-Za-z0-9][A-Za-z0-9 _.-]{0,99}?) use)\?$', re.IGNORECASE)
FORBIDDEN = re.compile(r'\b(?:and|or|not|if|for|with|without|revision|ignore|instructions|why|how)\b', re.IGNORECASE)
LABEL = re.compile(r'\b(?:MCU|Microcontroller)\s*:', re.IGNORECASE)
MENTION = re.compile(r'\b(?:MCU|Microcontroller)\b', re.IGNORECASE)
RISK = re.compile(r"\b(?:ignore|instruction|instructions|incorrect|wrong|not|no|never|doesn['’]t|isn['’]t|instead|conflict|conflicting|except|maybe|uncertain|false|rather|override|disregard|do not|hypothetical|hypothetically|example|correction|corrected)\b", re.IGNORECASE)
RAM_TERM = re.compile(r'\binstruction RAM\b', re.IGNORECASE)
CAVEAT = re.compile(r'^[ \t]*(?:(?:-|\*|•|â€¢)[ \t]*)?Physical board revision is unknown; listing claims are not hardware verification\.[ \t]*$')
OTHER_CHIP = re.compile(r'\b(?:processor|chip|SoC)\b|\b[A-Za-z0-9_-]+-based\b', re.IGNORECASE)
POSITIVE_PROSE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9 _.,-]{0,300}\b([A-Za-z0-9][A-Za-z0-9_-]{0,63})-based microcontroller board\b[A-Za-z0-9 _.,;:()\-]*$', re.IGNORECASE)
FIELD = re.compile(r'^[ \t]*(?:(?:-|\*|•|â€¢)[ \t]*)?(MCU|Microcontroller):[ \t]*([A-Za-z0-9][A-Za-z0-9_-]{0,63})(?: \(description, line [1-9][0-9]{0,5}; listing claim\))?(?:Â?\u00a0)?[ \t]*$', re.IGNORECASE)

def select_mcu(question, fragments):
    match = QUESTION.fullmatch(question)
    if not match or FORBIDDEN.search(match.group(1) or match.group(2)):
        return []
    found = []; prose = []
    for fragment in fragments:
        for line in fragment['text'].splitlines():
            if not CAVEAT.fullmatch(line) and RISK.search(RAM_TERM.sub('', line)):
                return []
            if not LABEL.search(line):
                if MENTION.search(line):
                    if len(MENTION.findall(line)) != 1:
                        return []
                    match = POSITIVE_PROSE.fullmatch(line.strip())
                    if not match:
                        return []
                    if OTHER_CHIP.search(line[match.end(1) + len('-based microcontroller board'):]):
                        return []
                    prose.append(match.group(1))
                elif OTHER_CHIP.search(line):
                    return []
                continue
            field = FIELD.fullmatch(line)
            if not field:
                return []
            chip = field.group(2)
            if not re.search('[A-Za-z]', chip) or not re.search('[0-9]', chip):
                return []
            found.append((chip, fragment['handle'], line[field.start(1):field.end(2)]))
    if not found or len({item[0] for item in found}) != 1:
        return []
    if any(chip != found[0][0] for chip in prose):
        return []
    _, handle, quote = found[0]
    return [{'handle': handle, 'quote': quote}]
