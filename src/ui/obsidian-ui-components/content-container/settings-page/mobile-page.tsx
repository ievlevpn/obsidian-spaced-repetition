import { Setting, SettingGroup } from "obsidian";

import { DataManager } from "src/data/data-manager";
import { PullDownAction } from "src/data/settings";
import { SettingsManager } from "src/data/settings-manager";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { SettingsPage } from "src/ui/obsidian-ui-components/content-container/settings-page/settings-page";
import { SettingsPageType } from "src/ui/obsidian-ui-components/content-container/settings-page/settings-page-manager";

/**
 * Settings that only apply on phones and tablets.
 *
 * @class MobilePage
 * @extends {SettingsPage}
 */
export class MobilePage extends SettingsPage {
    constructor(
        pageContainerEl: HTMLElement,
        plugin: SRPlugin,
        settingsManager: SettingsManager,
        dataManager: DataManager,
        pageType: SettingsPageType,
        applySettingsUpdate: (callback: () => unknown) => void,
        display: () => void,
        openPage: (pageType: SettingsPageType) => void,
        scrollListener: (scrollPosition: number) => void,
    ) {
        super(
            pageContainerEl,
            plugin,
            settingsManager,
            dataManager,
            pageType,
            applySettingsUpdate,
            display,
            openPage,
            scrollListener,
        );

        new SettingGroup(this.containerEl)
            .setHeading(t("GROUP_GESTURES"))
            .addSetting((setting: Setting) => {
                setting
                    .setName(t("SWIPE_TO_SKIP"))
                    .setDesc(t("SWIPE_TO_SKIP_DESC"))
                    .addToggle((toggle) =>
                        toggle
                            .setValue(this.settingsManager.settings.mobileSwipeToSkip)
                            .onChange(async (value) => {
                                this.settingsManager.settings.mobileSwipeToSkip = value;
                                await this.settingsManager.save();
                            }),
                    );
            })
            .addSetting((setting: Setting) => {
                setting
                    .setName(t("SWIPE_TO_UNDO"))
                    .setDesc(t("SWIPE_TO_UNDO_DESC"))
                    .addToggle((toggle) =>
                        toggle
                            .setValue(this.settingsManager.settings.mobileSwipeToUndo)
                            .onChange(async (value) => {
                                this.settingsManager.settings.mobileSwipeToUndo = value;
                                await this.settingsManager.save();
                            }),
                    );
            })
            .addSetting((setting: Setting) => {
                setting
                    .setName(t("PULL_DOWN_ACTION"))
                    .setDesc(t("PULL_DOWN_ACTION_DESC"))
                    .addDropdown((dropdown) =>
                        dropdown
                            .addOption("menu", t("PULL_DOWN_MENU"))
                            .addOption("important", t("IMPORTANT_CARD"))
                            .addOption("bury", t("BURY_CARD"))
                            .addOption("suspend", t("SUSPEND_CARD"))
                            .addOption("off", t("PULL_DOWN_OFF"))
                            .setValue(this.settingsManager.settings.mobilePullDownAction)
                            .onChange(async (value) => {
                                this.settingsManager.settings.mobilePullDownAction =
                                    value as PullDownAction;
                                await this.settingsManager.save();
                            }),
                    );
            });
    }
}
