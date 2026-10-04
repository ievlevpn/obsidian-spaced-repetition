import { t } from "src/lang/helpers";
import SRButtonComponent from "src/ui/sr-button";

export default class UndoButtonComponent extends SRButtonComponent {
    public constructor(
        container: HTMLElement,
        undoClickHandler: () => void,
        classNames?: string[],
    ) {
        super(container, {
            classNames: ["sr-undo-button", ...(classNames ?? [])],
            icon: "undo-2",
            tooltip: t("UNDO"),
            onClick: () => {
                undoClickHandler();
            },
        });
    }
}
