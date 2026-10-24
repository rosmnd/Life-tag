import staffMarkup from "./staff.html?raw";
import { useLifeTag } from "./useLifeTag";

export function StaffPage() {
  useLifeTag();
  return <div id="lifetag" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: staffMarkup }} />;
}
