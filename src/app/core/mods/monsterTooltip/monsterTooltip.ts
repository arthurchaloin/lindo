import { Mod } from "../mod";

type TooltipData = {
    id: number;
    groupLevel: number;
    yellowStarsCount: number;
    redStarsCount: number;
    soloXp: number;
    partyXp: number;
    bonusPackActive: boolean;
    monsters: any[];
};

export class MonsterTooltip extends Mod {

    private visible = false;
    private monsterGroups = [];

    public startMod(): void {
        this.wGame.addEventListener("keydown", e => this.onKeyEvent(e));
        this.wGame.addEventListener("keyup", e => this.onKeyEvent(e));

        this.on(this.wGame.dofus.connectionManager, "MapComplementaryInformationsDataMessage", ({ actors }) => {
            this.monsterGroups = actors.filter(actor => actor._type === "GameRolePlayGroupMonsterInformations");
            this.update();
        });

        this.on(this.wGame.dofus.connectionManager, "GameMapMovementMessage", ({ actorId, keyMovements }) => {
            const group = this.monsterGroups.find(group => group.contextualId === actorId);
            if (group) {
                group.disposition.cellId = keyMovements[keyMovements.length - 1];
                this.update();
            }
        });

        this.on(this.wGame.dofus.connectionManager, "GameContextRemoveElementMessage", ({ id }) => {
            const groupIndex = this.monsterGroups.findIndex(group => group.contextualId === id);
            if (groupIndex > -1) {
                this.monsterGroups.splice(groupIndex, 1);
                this.update();
            }
        });

        this.on(this.wGame.dofus.connectionManager, "GameRolePlayShowActorMessage", ({ informations }) => {
            if (informations._type === "GameRolePlayGroupMonsterInformations") {
                this.monsterGroups.push(informations);
                this.update();
            }
        });

        this.on(this.wGame.dofus.connectionManager, "GameFightStartingMessage", () => this.hide());
    }

    public reset() {
        this.wGame.removeEventListener("keydown", this.onKeyEvent);
        this.wGame.removeEventListener("keyup", this.onKeyEvent);
        this.hide();
        super.reset();
    }

    private show() {
        if (this.visible || this.wGame.gui.fightManager.fightState != -1) {
            return;
        }

        const padding = 10;
        const { clientWidth, clientHeight } = this.wGame.document.body;
        for (const group of this.monsterGroups) {
            const tooltip = this.injectTooltip(this.getTooltipData(group));
            const scenePos = this.wGame.isoEngine.mapRenderer.getCellSceneCoordinate(group.disposition.cellId);
            const pixelPos = this.wGame.isoEngine.mapScene.convertSceneToCanvasCoordinate(scenePos.x, scenePos.y);

            pixelPos.x -= tooltip.clientWidth / 2;
            pixelPos.y -= tooltip.clientHeight + 40;

            if (pixelPos.x < padding) {
                pixelPos.x = padding;
            }
            if (pixelPos.y < padding) {
                pixelPos.y = padding;
            }

            const maxX = clientWidth - tooltip.clientWidth - padding;
            if (pixelPos.x > maxX) {
                pixelPos.x = maxX;
            }

            const maxY = clientHeight - tooltip.clientHeight - padding;
            if (pixelPos.y > maxY) {
                pixelPos.y = maxY;
            }

            tooltip.setAttribute("style", `left: ${pixelPos.x}px; top: ${pixelPos.y}px`);
        }

        this.visible = true;
    }

    private hide() {
        if (!this.visible) {
            return;
        }

        const tooltips = this.wGame.document.getElementsByClassName("lindo__TooltipBox");
        while (tooltips.length > 0) {
            tooltips[0].parentNode.removeChild(tooltips[0]);
        }

        this.visible = false;
    }

    private injectTooltip(data: TooltipData): HTMLElement {
        const target = this.wGame.document.getElementsByClassName("foreground")[0];
        const levelLabel = this.translate.instant("app.option.vip.monstertooltip.level");
        const groupLabel = this.translate.instant("app.option.vip.monstertooltip.group");

        // Stuff needs to be one lined, otherwise the game will display spaces and newlines
        let tooltip = `<div id="lindo__TooltipBox${data.id}" class="TooltipBox lindo__TooltipBox"><div class="content" style="position: relative"><div class="sceneTooltip monsterInfoTooltip"><div class="level">${levelLabel} ${data.groupLevel}</div><div class="StarCounter">`;

        let starIndex = 0;
        for (; starIndex < data.redStarsCount; starIndex += 1) {
            tooltip += `<div class="star level2"></div>`;
        }
        for (; starIndex < data.redStarsCount + data.yellowStarsCount; starIndex += 1) {
            tooltip += `<div class="star level1"></div>`;
        }
        for (; starIndex < 5; starIndex += 1) {
            tooltip += `<div class="star"></div>`;
        }

        if (data.bonusPackActive) {
            tooltip += `<div class="bonusContainer bonusPackActive"><div class="bonusContainerPlus">+</div><div class="bonusStar star1"></div><div class="bonusStar star2"></div><div class="bonusStar star3"></div><div class="linkToShop Button"></div></div>`;
        }
        else {
            tooltip += `<div class="bonusContainer"><div class="bonusContainerPlus">+</div><div class="bonusStar star1"></div><div class="bonusStar star2"></div><div class="bonusStar star3"></div><div class="linkToShop Button"></div></div>`;
        }

        tooltip += `</div><div class="xpPreview"><div>${this.formatNumber(data.soloXp)} XP</div>`;
        if (data.partyXp > -1) {
            tooltip += `<div>${this.formatNumber(data.partyXp)} XP (${groupLabel})</div>`;
        }
        tooltip += `</div>`;

        for (const monster of data.monsters) {
            tooltip += `<div>${monster.staticInfos.nameId} (${monster.staticInfos.level})</div>`;
        }

        tooltip += `</div></div></div></div>`;
        target.insertAdjacentHTML("beforeend", tooltip);
        return this.wGame.document.getElementById(`lindo__TooltipBox${data.id}`);
    }

    private getTooltipData(group: any): TooltipData {
        const { partyData, characterBaseInformations } = this.wGame.gui.playerData;
        const monsters = [group.staticInfos.mainCreatureLightInfos, ...group.staticInfos.underlings];
        const groupLevel = monsters.reduce((level, monster) => level + monster.staticInfos.level, 0);
        const starsCount = Math.min(Math.round(group.ageBonus / 20), 10);
        const redStarsCount = Math.max(starsCount - 5, 0);
        const yellowStarsCount = Math.min(starsCount, 5) - redStarsCount;
        const monstersXp = monsters.reduce((xp, monster) => xp + monster.staticInfos.xp, 0);
        const highestMonsterLevel = monsters.slice().sort((a, b) => a.staticInfos.level < b.staticInfos.level ? 1 : 1).pop();

        const soloXp = this.calculateXp(
            monstersXp,
            characterBaseInformations.level,
            characterBaseInformations.level,
            groupLevel,
            highestMonsterLevel,
            group.ageBonus,
        );

        let partyXp = -1;
        if (Object.keys(partyData._partyFromId).length > 0) {
            const party = partyData._partyFromId[Object.keys(partyData._partyFromId)[0]];
            const partyLevels = [characterBaseInformations.level, ...Object.keys(party._members).map(id => party._members[id].level)];
            const partyLevel = partyLevels.reduce((total, level) => total + level);
            const highestPartyLevel = partyLevels.slice().sort((a, b) => a < b ? -1 : 1).pop();
            const partySizeExcludingLowLevels = partyLevels.filter(level => level >= highestPartyLevel / 3).length;
            const partySizeModifier = MonsterTooltip.partySizeModifier[partySizeExcludingLowLevels];
            partyXp = this.calculateXp(
                monstersXp,
                characterBaseInformations.level,
                partyLevel,
                groupLevel,
                highestMonsterLevel,
                group.ageBonus,
                partySizeModifier,
            );
        }

        const bonusPackActive = this.wGame.gui.playerData.identification.subscriptionEndDate > Date.now();
        return {
            id: group.contextualId,
            monsters,
            groupLevel,
            yellowStarsCount,
            redStarsCount,
            soloXp,
            partyXp,
            bonusPackActive,
        }
    }

    private calculateXp(
        monstersXp: number,
        playerLevel: number,
        partyLevel: number,
        groupLevel: number,
        highestMonsterLevel: number,
        ageBonus: number,
        partySizeModifier: number = 1,
    ): number {
        let modifier = 1;
        if (groupLevel > partyLevel + 10) {
            modifier = (partyLevel + 10) / groupLevel;
        }
        else if (partyLevel > groupLevel + 5) {
            modifier = groupLevel / partyLevel;
        }
        else if (partyLevel > highestMonsterLevel * 2.5) {
            modifier = Math.floor(highestMonsterLevel * 2.5) / partyLevel;
        }

        const { _base, _additionnal, _objectsAndMountBonus } = this.wGame.gui.playerData.characters.mainCharacter.characteristics.wisdom;
        const wisdom = _base + _additionnal + _objectsAndMountBonus;
        const wisdomModifier = 1 + wisdom / 100;
        const ageModifier = 1 + ageBonus / 100;
        const bonusModifier = 1 + this.wGame.gui.playerData.experienceFactor / 100;
        const contributionModifier = playerLevel / partyLevel;

        return Math.floor(
            bonusModifier * Math.floor(
                partySizeModifier * Math.round(
                    contributionModifier * Math.floor(
                        wisdomModifier * Math.floor(
                            ageModifier * Math.floor(
                                monstersXp * modifier,
                            ),
                        ),
                    ),
                ),
            ),
        );
    }

    private update() {
        if (!this.visible) {
            return;
        }

        this.hide();
        this.show();
    }

    private onKeyEvent(event: any) {
        if (event.key === "z") {
            if (event.type === "keydown") {
                this.show();
            }
            else if (event.type === "keyup") {
                this.hide();
            }
        }
    }

    private formatNumber(n: number): string {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }

    private static partySizeModifier = {
        1: 1,
        2: 1.1,
        3: 1.5,
        4: 2.3,
        5: 3.1,
        6: 3.6,
        7: 4.2,
        8: 4.7,
    }

}
