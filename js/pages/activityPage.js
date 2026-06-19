import { claimDragonBoatOnline, useDragonBoatBag, getInventory, getLotteryRound, buyLotteryTicket, getLotteryHistory, getUserLotteryTickets } from '../api.js';
import { createParticles, showToast, itemImageHTML, openItemDetail, QUALITY_CONFIG } from '../utils.js';
import { updateGlobalShells } from '../auth.js';
import { createIcons, icons } from 'lucide';

export const activityPage = {
    onlineTotal: 0,
    interval: null,
    lotteryInterval: null,
    selectedNumbers: [],
    currentRound: null,
    buyQuantity: 1,

    render(container) {
        this.attachEvents(container);
        createParticles(container.querySelector('#activity-particles'), 20);
        this.loadActivityData();
        this.startOnlineTimer();
        this.initLottery();
    },

    attachEvents(container) {
        // Tab切换
        container.querySelectorAll('.activity-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                this.switchTab(targetTab);
            });
        });

        // 领取在线礼包按钮
        ['1', '10', '60'].forEach(min => {
            const btn = container.querySelector('#btn-claim-online-' + min);
            if (btn) {
                btn.addEventListener('click', async () => {
                    try {
                        const result = await claimDragonBoatOnline();
                        if (result.success) {
                            this.updateOnlineDisplay(result);
                            if (result.claimed_1min || result.claimed_10min || result.claimed_60min) {
                                showToast('领取成功！获得端午节福袋！', 'success');
                            } else {
                                showToast('暂无可领取的奖励', 'info');
                            }
                        } else if (result.is_dragon_boat === false) {
                            showToast('端午活动已结束', 'info');
                        }
                    } catch (e) {
                        console.error(e);
                        showToast('领取失败', 'error');
                    }
                });
            }
        });

        createIcons({ icons });
    },

    switchTab(tabName) {
        document.querySelectorAll('.activity-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.activity-panel').forEach(p => p.classList.remove('active'));
        
        document.querySelector('.activity-tab[data-tab="' + tabName + '"]').classList.add('active');
        document.querySelector('#panel-' + tabName).classList.add('active');

        if (tabName === 'lottery') {
            this.loadLotteryData();
            this.startLotteryTimer();
        }
    },

    async loadActivityData() {
        try {
            const result = await claimDragonBoatOnline();
            if (result.success) {
                this.updateOnlineDisplay(result);
            } else if (result.is_dragon_boat === false) {
                const hero = document.querySelector('.activity-hero');
                if (hero) {
                    hero.innerHTML = '<div class="activity-badge" style="background:#666;">已结束</div>' +
                        '<h1>端午活动</h1>' +
                        '<p class="activity-date">2026年6月19日</p>';
                }
                document.querySelectorAll('.btn-claim-online').forEach(btn => {
                    btn.disabled = true;
                    btn.innerHTML = '<span>已结束</span>';
                });
            }
        } catch (e) {
            console.error(e);
        }
    },

    updateOnlineDisplay(result) {
        const online = result.online_total || 0;
        this.onlineTotal = online;

        const displayEl = document.getElementById('db-online-display');
        if (displayEl) {
            displayEl.textContent = online;
        }

        const claimed1 = result.claimed_1min;
        const claimed10 = result.claimed_10min;
        const claimed60 = result.claimed_60min;

        this.updateClaimButton('1', online >= 60, claimed1);
        this.updateClaimButton('10', online >= 600, claimed10);
        this.updateClaimButton('60', online >= 3600, claimed60);
    },

    updateClaimButton(minute, hasEnough, claimed) {
        const btn = document.getElementById('btn-claim-online-' + minute);
        const item = document.getElementById('online-reward-' + minute);
        if (!btn || !item) return;

        if (claimed) {
            btn.disabled = true;
            btn.innerHTML = '<span>已领取</span>';
            item.classList.add('claimed');
        } else if (hasEnough) {
            btn.disabled = false;
            item.classList.add('available');
        } else {
            btn.disabled = true;
            item.classList.remove('available');
        }
    },

    startOnlineTimer() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(async () => {
            try {
                const result = await claimDragonBoatOnline();
                if (result.success) {
                    this.updateOnlineDisplay(result);
                }
            } catch (e) {
                // ignore
            }
        }, 30000);
    },

    initLottery() {
        const grid = document.getElementById('lottery-number-grid');
        if (grid) {
            grid.addEventListener('click', (e) => {
                if (e.target.classList.contains('lottery-number-btn')) {
                    this.toggleNumber(e.target.dataset.num);
                }
            });
        }

        const clearBtn = document.getElementById('btn-lottery-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearNumbers();
            });
        }

        const buyBtn = document.getElementById('btn-lottery-buy');
        if (buyBtn) {
            buyBtn.addEventListener('click', async () => {
                await this.buyTicket();
            });
        }

        const qtyContainer = document.getElementById('lottery-quantity-buttons');
        if (qtyContainer) {
            qtyContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('quantity-btn')) {
                    this.buyQuantity = parseInt(e.target.dataset.qty, 10);
                    qtyContainer.querySelectorAll('.quantity-btn').forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');
                    this.updateBuyButton();
                }
            });
        }
    },

    toggleNumber(num) {
        if (this.selectedNumbers.includes(num)) {
            this.selectedNumbers = this.selectedNumbers.filter(n => n !== num);
        } else if (this.selectedNumbers.length < 6) {
            this.selectedNumbers.push(num);
        }
        this.selectedNumbers.sort((a, b) => {
            const order = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];
            return order.indexOf(a) - order.indexOf(b);
        });
        this.updateLotteryUI();
    },

    clearNumbers() {
        this.selectedNumbers = [];
        this.updateLotteryUI();
    },

    updateLotteryUI() {
        const grid = document.getElementById('lottery-number-grid');
        if (grid) {
            grid.querySelectorAll('.lottery-number-btn').forEach(btn => {
                if (this.selectedNumbers.includes(btn.dataset.num)) {
                    btn.classList.add('selected');
                } else {
                    btn.classList.remove('selected');
                }
            });
        }

        const slots = document.querySelectorAll('.selected-slot');
        slots.forEach((slot, index) => {
            slot.textContent = this.selectedNumbers[index] || '--';
            if (this.selectedNumbers[index]) {
                slot.classList.add('filled');
            } else {
                slot.classList.remove('filled');
            }
        });

        const buyBtn = document.getElementById('btn-lottery-buy');
        if (buyBtn) {
            buyBtn.disabled = this.selectedNumbers.length !== 6;
        }
        this.updateBuyButton();
    },

    updateBuyButton() {
        const textEl = document.getElementById('btn-lottery-buy-text');
        if (textEl) {
            const cost = 100 * (this.buyQuantity || 1);
            textEl.textContent = `购买${this.buyQuantity || 1}注 (${cost}果壳币)`;
        }
    },

    async loadLotteryData() {
        try {
            this.currentRound = await getLotteryRound();
            this.updateLotteryInfo();
            
            const history = await getLotteryHistory(10);
            this.updateLotteryHistory(history);

            if (this.currentRound && this.currentRound.round_id) {
                const tickets = await getUserLotteryTickets(this.currentRound.round_id);
                this.updateMyTickets(tickets);
            }
        } catch (e) {
            console.error('加载彩票数据失败:', e);
        }
    },

    updateLotteryInfo() {
        if (!this.currentRound) return;

        document.getElementById('lottery-round-number').textContent = this.currentRound.round_number || '--';
        document.getElementById('lottery-total-pool').textContent = (this.currentRound.total_pool || 0).toLocaleString();
        document.getElementById('lottery-user-count').textContent = (this.currentRound.user_ticket_count || 0) + '/30';
        
        this.updateLotteryTime();
    },

    updateLotteryTime() {
        if (!this.currentRound || !this.currentRound.time_left) {
            document.getElementById('lottery-time-left').textContent = '--';
            return;
        }

        const seconds = Math.floor(this.currentRound.time_left);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        document.getElementById('lottery-time-left').textContent = 
            h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
    },

    startLotteryTimer() {
        if (this.lotteryInterval) clearInterval(this.lotteryInterval);
        this.lotteryInterval = setInterval(() => {
            if (this.currentRound && this.currentRound.time_left > 0) {
                this.currentRound.time_left--;
                this.updateLotteryTime();
            }
        }, 1000);
    },

    async buyTicket() {
        if (this.selectedNumbers.length !== 6) {
            showToast('请选择6个号码', 'error');
            return;
        }

        const numbers = this.selectedNumbers.join('');
        const quantity = this.buyQuantity || 1;
        try {
            const result = await buyLotteryTicket(numbers, quantity);
            if (result.success) {
                showToast(`购买成功！本次${quantity}注，该号码累计${result.total_quantity || quantity}注`, 'success');
                this.clearNumbers();
                await this.loadLotteryData();
                await updateGlobalShells();
            } else {
                showToast(result.message || '购买失败', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('购买失败', 'error');
        }
    },

    updateLotteryHistory(history) {
        const container = document.getElementById('lottery-history');
        if (!container) return;

        if (!history || history.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无往期开奖记录</div>';
            return;
        }

        const html = history.map(round => {
            let resultsHtml = '';
            if (round.results) {
                resultsHtml = round.results.map(r => {
                    if (r.total_people > 0) {
                        return '<div class="history-result">' + r.prize_level + ': ' + r.total_people + '人中奖</div>';
                    } else {
                        return '<div class="history-result rollover">' + r.prize_level + ': 奖金积累到下一期</div>';
                    }
                }).join('');
            }
            
            let userTicketsHtml = '';
            if (round.user_tickets && round.user_tickets.length > 0) {
                userTicketsHtml = '<div class="history-my-tickets"><div class="history-my-tickets-title">我的彩票</div>' +
                    round.user_tickets.map(t => {
                        const winClass = t.is_winning ? ' winning' : '';
                        const prizeInfo = t.is_winning && t.prize_level ? ' (' + t.prize_level + ' +' + (t.prize_amount || 0).toLocaleString() + ')' : '';
                        return '<div class="history-my-ticket' + winClass + '">' + t.numbers + '<span class="ticket-quantity">x' + t.quantity + '</span>' + prizeInfo + '</div>';
                    }).join('') +
                    '</div>';
            }
            
            return '<div class="lottery-history-item">' +
                '<div class="history-round">' + round.round_number + '</div>' +
                '<div class="history-numbers">' + (round.winning_numbers || '--') + '</div>' +
                '<div class="history-pool">奖池: ' + (round.total_pool || 0).toLocaleString() + '</div>' +
                resultsHtml +
                userTicketsHtml +
                '</div>';
        }).join('');

        container.innerHTML = html;
    },

    updateMyTickets(tickets) {
        const container = document.getElementById('lottery-my-tickets');
        if (!container) return;

        if (!tickets || tickets.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无彩票</div>';
            return;
        }

        const hasWinning = this.currentRound && this.currentRound.winning_numbers;
        
        const html = tickets.map(ticket => {
            const isWin = hasWinning && ticket.is_winning;
            let badgeHtml = '';
            let amountHtml = '';
            if (isWin) {
                badgeHtml = '<span class="win-badge">' + ticket.prize_level + '</span>';
            }
            if (ticket.prize_amount > 0) {
                amountHtml = '<span class="win-amount">+' + ticket.prize_amount.toLocaleString() + '</span>';
            }
            const qtyLabel = ticket.quantity > 1 ? ' <span class="ticket-quantity">x' + ticket.quantity + '</span>' : '';
            return '<div class="my-ticket-item ' + (isWin ? 'winning' : '') + '">' +
                '<div class="ticket-numbers">' + ticket.numbers + qtyLabel + '</div>' +
                '<div class="ticket-status">' + badgeHtml + amountHtml + '</div>' +
                '</div>';
        }).join('');

        container.innerHTML = html;
    },

    cleanup() {
        if (this.interval) clearInterval(this.interval);
        if (this.lotteryInterval) clearInterval(this.lotteryInterval);
    }
};