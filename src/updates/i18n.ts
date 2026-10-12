import messages from "./messages.json";
export type UpdateKey = keyof typeof messages.en;
export function updateText(language: string, key: UpdateKey) {
  return (messages[language as keyof typeof messages] || messages.en)[key];
}
