/* ===== INSTAGRAM-STYLE NOTES WITH LRCLIB LYRICS ===== */

class InstagramNoteViewer {
    constructor() {
        this.currentNote = null;
        this.currentSongData = null;
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        this.lyrics = [];
        this.currentLyricIndex = 0;
        this.youtubePlayer = null;
        this.animationFrameId = null;
    }

    // Format time untuk display (MM:SS)
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    // Escape HTML
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Fetch lyrics dari LRCLIB API
    async fetchLyricsFromLRCLIB(songTitle, artistName) {
        try {
            const query = `${songTitle} ${artistName}`.trim();
            if (!query) {
                console.log('⚠️ Song title atau artist name kosong');
                return [];
            }

            console.log('🔍 Searching LRCLIB for:', query);
            const response = await fetch(
                `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`
            );
            
            if (!response.ok) {
                console.warn('❌ LRCLIB search failed with status:', response.status);
                return [];
            }

            const results = await response.json();
            if (!results || results.length === 0) {
                console.warn('⚠️ Lirik tidak ditemukan di LRCLIB');
                return [];
            }

            // Ambil hasil pertama (paling akurat)
            const trackId = results[0].id;
            console.log('✅ Found track ID:', trackId);
            
            const trackResponse = await fetch(
                `https://lrclib.net/api/get/${trackId}`
            );

            if (!trackResponse.ok) {
                console.warn('❌ Gagal fetch lirik detail');
                return [];
            }

            const trackData = await trackResponse.json();
            
            // Parse synced lyrics (format: [MM:SS.MS]lirik)
            if (trackData.syncedLyrics) {
                console.log('✅ Synced lyrics found');
                return this.parseSyncedLyrics(trackData.syncedLyrics);
            } else if (trackData.plainLyrics) {
                console.log('✅ Plain lyrics found');
                return this.parsePlainLyrics(trackData.plainLyrics);
            }

            console.warn('⚠️ No lyrics found in track data');
            return [];
        } catch (error) {
            console.error('❌ Error fetching lyrics:', error);
            return [];
        }
    }

    // Parse synced lyrics [MM:SS.MS]lirik format
    parseSyncedLyrics(syncedLyrics) {
        const lines = syncedLyrics.split('\n').filter(line => line.trim());
        const parsed = [];

        lines.forEach(line => {
            const timeMatch = line.match(/\[(\d+):(\d+\.?\d*)\]/);
            if (timeMatch) {
                const minutes = parseInt(timeMatch[1]);
                const seconds = parseFloat(timeMatch[2]);
                const totalSeconds = minutes * 60 + seconds;
                const lyricText = line.replace(/\[\d+:\d+\.?\d*\]/, '').trim();

                if (lyricText) {
                    parsed.push({
                        time: totalSeconds,
                        text: lyricText
                    });
                }
            }
        });

        console.log(`✅ Parsed ${parsed.length} synced lyrics lines`);
        return parsed;
    }

    // Parse plain lyrics (tanpa timestamp)
    parsePlainLyrics(plainLyrics) {
        const lines = plainLyrics.split('\n').filter(line => line.trim());
        const parsed = lines.map((text, index) => ({
            time: index * 3, // Estimasi 3 detik per baris
            text: text.trim()
        }));
        
        console.log(`✅ Parsed ${parsed.length} plain lyrics lines`);
        return parsed;
    }

    // Update lyric display berdasarkan waktu
    updateLyricDisplay(currentTime) {
        const container = document.getElementById('note-lyrics-container');
        if (!container || this.lyrics.length === 0) return;

        container.innerHTML = '';

        this.lyrics.forEach((line, index) => {
            const lineEl = document.createElement('div');
            lineEl.className = 'lyrics-line';

            // Determine if this line is active, past, or upcoming
            if (currentTime >= line.time && 
                (index === this.lyrics.length - 1 || currentTime < this.lyrics[index + 1].time)) {
                lineEl.classList.add('active');
            } else if (currentTime > line.time) {
                lineEl.classList.add('past');
            } else {
                lineEl.classList.add('upcoming');
            }

            lineEl.textContent = line.text;
            container.appendChild(lineEl);
        });
    }

    // Inisialisasi YouTube Player
    initYoutubePlayer(videoId) {
        return new Promise((resolve) => {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            
            window.onYouTubeIframeAPIReady = () => {
                this.youtubePlayer = new YT.Player('note-youtube-iframe', {
                    height: '1',
                    width: '1',
                    videoId: videoId,
                    events: {
                        'onReady': (event) => {
                            this.duration = event.target.getDuration();
                            const durationEl = document.getElementById('music-duration');
                            if (durationEl) {
                                durationEl.textContent = this.formatTime(this.duration);
                            }
                            console.log('✅ YouTube player ready. Duration:', this.formatTime(this.duration));
                            resolve();
                        },
                        'onStateChange': (event) => {
                            if (event.data === YT.PlayerState.PLAYING) {
                                console.log('▶️ Video playing');
                                this.isPlaying = true;
                                this.updatePlayback();
                            } else if (event.data === YT.PlayerState.PAUSED) {
                                console.log('⏸️ Video paused');
                                this.isPlaying = false;
                                cancelAnimationFrame(this.animationFrameId);
                            }
                        }
                    }
                });
            };

            if (!window.YT) {
                document.head.appendChild(tag);
            } else {
                window.onYouTubeIframeAPIReady();
            }
        });
    }

    // Update playback
    updatePlayback() {
        if (!this.youtubePlayer || !this.isPlaying) return;

        this.currentTime = this.youtubePlayer.getCurrentTime();
        
        // Update current time display
        const currentTimeEl = document.getElementById('music-current-time');
        if (currentTimeEl) {
            currentTimeEl.textContent = this.formatTime(this.currentTime);
        }

        // Update lyric display
        this.updateLyricDisplay(this.currentTime);

        // Loop untuk update
        this.animationFrameId = requestAnimationFrame(() => this.updatePlayback());
    }

    // Toggle play/pause
    togglePlay() {
        if (!this.youtubePlayer) {
            console.error('❌ YouTube player not initialized');
            return;
        }

        const playBtn = document.getElementById('music-play-btn');
        
        if (this.isPlaying) {
            this.youtubePlayer.pauseVideo();
            if (playBtn) playBtn.textContent = '▶ Putar Musik';
            this.isPlaying = false;
            cancelAnimationFrame(this.animationFrameId);
        } else {
            this.youtubePlayer.playVideo();
            if (playBtn) playBtn.textContent = '⏸ Henti';
            this.isPlaying = true;
            this.updatePlayback();
        }
    }

    // Open viewer modal
    async openViewer(userId, noteData) {
        this.currentNote = { userId, ...noteData };
        this.isPlaying = false;

        // Create modal HTML
        const modal = document.createElement('div');
        modal.id = 'note-viewer-instagram-modal';
        modal.className = 'modal note-viewer-modal-instagram';
        modal.style.display = 'flex';

        modal.innerHTML = `
            <div class="note-viewer-instagram">
                <!-- Header -->
                <div class="note-insta-header">
                    <img class="note-insta-avatar" src="${this.escapeHtml(noteData.userPhoto)}" alt="user">
                    <div class="note-insta-user-info">
                        <p class="note-insta-username">${this.escapeHtml(noteData.userName)}</p>
                        <p class="note-insta-time">${formatTimeAgo(noteData.updatedAt)}</p>
                    </div>
                    <button class="note-insta-close" onclick="closeInstagramNoteViewer()">✕</button>
                </div>

                <!-- Content -->
                <div class="note-insta-content">
                    <!-- Music Info Card -->
                    <div class="note-music-info-card">
                        <p class="music-song-title">
                            <span class="music-icon">🎵</span>
                            <span id="music-song-title">${this.escapeHtml(noteData.songTitle || 'Loading...')}</span>
                        </p>
                        <p class="music-artist" id="music-artist">${this.escapeHtml(noteData.artistName || 'Unknown Artist')}</p>
                        <div class="music-duration-info">
                            <span id="music-current-time">0:00</span>
                            <span id="music-duration">0:00</span>
                        </div>
                    </div>

                    <!-- Lyrics Display -->
                    <div class="note-lyrics-container" id="note-lyrics-container">
                        <p class="no-lyrics-message">⏳ Memuat lirik...</p>
                    </div>

                    <!-- Music Controls -->
                    <div class="music-controls-row">
                        <button class="music-play-btn" id="music-play-btn" onclick="instagramNoteViewer.togglePlay()">
                            ▶ Putar Musik
                        </button>
                    </div>
                </div>

                <!-- Actions -->
                <div class="note-insta-actions">
                    <button class="note-action-btn-insta ${noteData.likes && noteData.likes[currentUser.uid] ? 'liked' : ''}" 
                            onclick="toggleLikeInstagramNote('${userId}')">
                        ${noteData.likes && noteData.likes[currentUser.uid] ? '❤️' : '🤍'} 
                        ${Object.keys(noteData.likes || {}).length}
                    </button>
                    <button class="note-action-btn-insta" onclick="focusReplyInstagramNote()">
                        💬 ${Object.keys(noteData.replies || {}).length}
                    </button>
                </div>
            </div>

            <!-- Hidden YouTube Iframe -->
            <div class="note-youtube-iframe-hidden">
                <div id="note-youtube-iframe"></div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeInstagramNoteViewer();
            }
        });

        // Initialize YouTube player
        if (noteData.youtubeId) {
            try {
                console.log('🎬 Initializing YouTube player with video ID:', noteData.youtubeId);
                await this.initYoutubePlayer(noteData.youtubeId);
            } catch (error) {
                console.error('❌ Error initializing YouTube player:', error);
            }
        }

        // Fetch lyrics
        console.log('📖 Fetching lyrics for:', noteData.songTitle, '-', noteData.artistName);
        const lyrics = await this.fetchLyricsFromLRCLIB(
            noteData.songTitle || '',
            noteData.artistName || ''
        );

        this.lyrics = lyrics;

        if (lyrics.length === 0) {
            const container = document.getElementById('note-lyrics-container');
            if (container) {
                container.innerHTML = '<p class="no-lyrics-message">😔 Lirik tidak tersedia untuk lagu ini</p>';
            }
        } else {
            this.updateLyricDisplay(0);
        }
    }

    // Close viewer
    close() {
        if (this.youtubePlayer && this.isPlaying) {
            this.youtubePlayer.stopVideo();
        }
        cancelAnimationFrame(this.animationFrameId);
        
        const modal = document.getElementById('note-viewer-instagram-modal');
        if (modal) {
            modal.remove();
        }
        this.lyrics = [];
        this.currentTime = 0;
    }
}

// Global instance
let instagramNoteViewer = new InstagramNoteViewer();

// Helper functions
function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Baru saja';
    if (minutes < 60) return `${minutes}m lalu`;
    if (hours < 24) return `${hours}h lalu`;
    return `${days}d lalu`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function closeInstagramNoteViewer() {
    instagramNoteViewer.close();
}

function toggleLikeInstagramNote(userId) {
    if (!currentUser) return;
    
    const likeRef = ref(database, `notes/${userId}/likes/${currentUser.uid}`);
    get(likeRef).then(snap => {
        if (snap.exists()) {
            set(likeRef, null);
        } else {
            set(likeRef, true);
        }
        // Refresh viewer
        if (instagramNoteViewer.currentNote) {
            get(ref(database, `notes/${userId}`)).then(snap => {
                if (snap.exists()) {
                    instagramNoteViewer.openViewer(userId, snap.val());
                }
            });
        }
    }).catch(err => console.error('Error toggling like:', err));
}

function focusReplyInstagramNote() {
    // Implement reply functionality jika diperlukan
    console.log('Reply feature akan diimplementasikan');
}

// Export untuk digunakan di chat.html
window.instagramNoteViewer = instagramNoteViewer;
window.closeInstagramNoteViewer = closeInstagramNoteViewer;
window.toggleLikeInstagramNote = toggleLikeInstagramNote;
window.focusReplyInstagramNote = focusReplyInstagramNote;
