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
        console.log(data);
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
            console.log(party)
            const partyLevels = [characterBaseInformations.level, ...Object.keys(party._members).map(id => party._members[id].level)];
            const partyLevel = partyLevels.reduce((total, level) => total + level);
            const highestPartyLevel = partyLevels.slice().sort((a, b) => a < b ? -1 : 1).pop();
            const partySizeExcludingLowLevels = partyLevels.filter(level => level >= highestPartyLevel / 3).length;
            const partySizeModifier = MonsterTooltip.partySizeModifier[partySizeExcludingLowLevels];
            console.log(partyLevels, highestPartyLevel, partySizeExcludingLowLevels, partySizeModifier);
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

        console.log(monstersXp, modifier, ageModifier, contributionModifier, partySizeModifier, wisdomModifier, bonusModifier)
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

function xp(e, t) {
    function i(e, t) {
        t = t || 0;
        var i = Math.pow(10, t),
            n = e * i;
        //@ts-ignore
        return parseInt(n, 10) / i
    }

    function n(e) {
        return e <= 0 ? 1 : 1 + e / 100
    }

    function o(e, t) {
        var i = 1;
        return "number" != typeof e || "number" != typeof t ? (console.error("xpFormula: one of getGroupXPCoeff's params is not a number", {
            totalPlayerLevels: e,
            totalMobLevels: t
        }), i) : (e - a > t ? i = t / e : e + 2 * a < t && (i = (e + 2 * a) / t), i)
    }

    function s(e) {
        return r[Math.max(0, Math.min(r.length, e) - 1)]
    }
    var a = 5,
        r = [1, 1.1, 1.5, 2.3, 3.1, 3.6, 4.2, 4.7];
    e.exports = function(e, t, a, r) {
        e = e || {}, r = r || 0, a = a || [e], Array.isArray(a) || (a = [e]);
        var l = 0;
        if ("number" != typeof e.level || "number" != typeof e.wisdom || "number" != typeof e.xpRatioMount || "number" != typeof e.experienceFactor || "number" != typeof e.xpGuildGivenPercent || "number" != typeof e.xpAlliancePrismBonusPercent) return console.error("xpFormula: there are params in playerData that are not a number", {
            level: e.level,
            wisdom: e.wisdom,
            experienceFactor: e.experienceFactor,
            xpRatioMount: e.xpRatioMount,
            xpGuildGivenPercent: e.xpGuildGivenPercent,
            xpAlliancePrismBonusPercent: e.xpAlliancePrismBonusPercent
        }), 0;
        var c = 0,
            u = 0,
            d = 0;
        a.forEach(function(e) {
            c += e.level, e.level > u && (u = e.level)
        });
        var h = Math.floor(u / 3);
        a.forEach(function(e) {
            e.level >= h && (d += 1)
        });
        var p = 0,
            m = 0,
            f = 0;
        Array.isArray(t) && t.forEach(function(e) {
            return "number" != typeof e.xp || "number" != typeof e.level ? void console.error("xpFormula: mob xp or level is not a number for mob: " + e.id, {
                xp: e.xp,
                level: e.level
            //@ts-ignore
            }) : (m += e.level, e.level > p && (p = e.level), void(f += i(e.xp)))
        });
        var g = o(c, m),
            _ = s(d);
        //@ts-ignore
        if (f = i(f * g), f = i(f * _), f = i(f * n(r)), f <= 0) return 0;
        //@ts-ignore
        var v = i(2.5 * p),
            y = Math.min(e.level, v);
        //@ts-ignore
        l = i(f * y / c), l = i(l * e.wisdom / 100 + l), l = Math.max(1, l);
        var b = 1 + e.experienceFactor / 100,
            w = 100;
        //@ts-ignore
        return w -= w * e.xpRatioMount / 100, w -= w * e.xpGuildGivenPercent / 100, w /= 100, e.xpAlliancePrismBonusPercent > 0 && (l *= 1 + e.xpAlliancePrismBonusPercent / 100), l = i(l * w) * b, i(l)
    }
}
