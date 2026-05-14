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
        this.clipStartTime = 0;
        this.clipEndTime = 0;
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

    // Fetch lyrics dari LRCLIB API
    async fetchLyricsFromLRCLIB(songTitle, artistName) {
        try {
            const query = `${songTitle} ${artistName}`.trim();
            const response = await fetch(
                `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`
            );
            
            if (!response.ok) {
                console.warn('❌ LRCLIB search failed');
                return [];
            }

            const results = await response.json();
            if (!results || results.length === 0) {
                console.warn('⚠️ Lirik tidak ditemukan di LRCLIB');
                return [];
            }

            // Ambil hasil pertama (paling akurat)
            const trackId = results[0].id;
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
                return this.parseSyncedLyrics(trackData.syncedLyrics);
            } else if (trackData.plainLyrics) {
                return this.parsePlainLyrics(trackData.plainLyrics);
            }

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
            const timeMatch = line.match(/\[(\d+):(\d+\.\d+)\]/);
            if (timeMatch) {
                const minutes = parseInt(timeMatch[1]);
                const seconds = parseFloat(timeMatch[2]);
                const totalSeconds = minutes * 60 + seconds;
                const lyricText = line.replace(/\[\d+:\d+\.\d+\]/, '').trim();

                if (lyricText) {
                    parsed.push({
                        time: totalSeconds,
                        text: lyricText
                    });
                }
            }
        });

        return parsed;
    }

    // Parse plain lyrics (tanpa timestamp)
    parsePlainLyrics(plainLyrics) {
        const lines = plainLyrics.split('\n').filter(line => line.trim());
        return lines.map((text, index) => ({
            time: index * 3, // Estimasi 3 detik per baris
            text: text.trim()
        }));
    }

    // Update lyric display berdasarkan waktu
    updateLyricDisplay(currentTime) {
        const container = document.getElementById('note-lyrics-container');
        if (!container || this.lyrics.length === 0) return;

        container.innerHTML = '';

        this.lyrics.forEach((line, index) => {
            const lineEl = document.createElement('div');
            lineEl.className = 'lyrics-line';

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
                            document.getElementById('music-duration').textContent = 
                                this.formatTime(this.duration);
                            this.clipEndTime = this.duration;
                            document.getElementById('clip-end-time').value = this.formatTime(this.duration);
                            resolve();
                        },
                        'onStateChange': (event) => {
                            if (event.data === YT.PlayerState.PLAYING) {
                                this.isPlaying = true;
                                this.updatePlayback();
                            } else if (event.data === YT.PlayerState.PAUSED) {
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
        
        // Update timeline
        const percent = (this.currentTime / this.duration) * 100;
        const progressBar = document.getElementById('timeline-progress');
        if (progressBar) {
            progressBar.style.width = percent + '%';
        }

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
        if (!this.youtubePlayer) return;

        const playBtn = document.getElementById('music-play-btn');
        
        if (this.isPlaying) {
            this.youtubePlayer.pauseVideo();
            playBtn.textContent = '▶ Putar';
            this.isPlaying = false;
            cancelAnimationFrame(this.animationFrameId);
        } else {
            // Cek apakah dalam clip range
            const seekTo = Math.max(this.clipStartTime, this.currentTime);
            this.youtubePlayer.seekTo(seekTo);
            this.youtubePlayer.playVideo();
            playBtn.textContent = '⏸ Jeda';
            this.isPlaying = true;
            this.updatePlayback();
        }
    }

    // Set clip start time
    setClipStart() {
        if (!this.youtubePlayer) return;
        const currentTime = this.youtubePlayer.getCurrentTime();
        this.clipStartTime = currentTime;
        document.getElementById('clip-start-time').value = this.formatTime(currentTime);
        this.updateClipRange();
    }

    // Set clip end time
    setClipEnd() {
        if (!this.youtubePlayer) return;
        const currentTime = this.youtubePlayer.getCurrentTime();
        this.clipEndTime = currentTime;
        document.getElementById('clip-end-time').value = this.formatTime(currentTime);
        this.updateClipRange();
    }

    // Update clip range visualization
    updateClipRange() {
        const track = document.querySelector('.timeline-track');
        if (!track) return;

        const startPercent = (this.clipStartTime / this.duration) * 100;
        const endPercent = (this.clipEndTime / this.duration) * 100;
        const width = endPercent - startPercent;

        let rangeEl = track.querySelector('.timeline-clip-range');
        if (!rangeEl) {
            rangeEl = document.createElement('div');
            rangeEl.className = 'timeline-clip-range';
            track.appendChild(rangeEl);
        }

        rangeEl.style.left = startPercent + '%';
        rangeEl.style.width = width + '%';
    }

    // Parse waktu dari input (MM:SS)
    parseTime(timeString) {
        const parts = timeString.split(':');
        if (parts.length !== 2) return 0;
        const minutes = parseInt(parts[0]) || 0;
        const seconds = parseInt(parts[1]) || 0;
        return minutes * 60 + seconds;
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
                    <img class="note-insta-avatar" src="${escapeHtml(noteData.userPhoto)}" alt="user">
                    <div class="note-insta-user-info">
                        <p class="note-insta-username">${escapeHtml(noteData.userName)}</p>
                        <p class="note-insta-time">${formatTimeAgo(noteData.updatedAt)}</p>
                    </div>
                    <button class="note-insta-close" onclick="closeInstagramNoteViewer()">✕</button>
                </div>

                <!-- Content -->
                <div class="note-insta-content">
                    <!-- Music Info -->
                    <div class="note-music-info-card">
                        <p class="music-song-title">
                            <span class="music-icon">🎵</span>
                            <span id="music-song-title">${escapeHtml(noteData.songTitle || 'Loading...')}</span>
                        </p>
                        <p class="music-artist" id="music-artist">${escapeHtml(noteData.artistName || '')}</p>
                        <div class="music-duration-info">
                            <span id="music-current-time">0:00</span>
                            <span id="music-duration">0:00</span>
                        </div>
                    </div>

                    <!-- Lyrics Display -->
                    <div class="note-lyrics-container" id="note-lyrics-container">
                        <p class="no-lyrics-message">⏳ Memuat lirik...</p>
                    </div>

                    <!-- Clip Editor -->
                    <div class="music-clip-editor">
                        <div class="clip-title">Edit Klip Musik</div>
                        
                        <div class="clip-time-inputs">
                            <div class="clip-time-input">
                                <div class="clip-time-label">Mulai</div>
                                <input type="text" id="clip-start-time" value="0:00" readonly>
                            </div>
                            <div class="clip-time-input">
                                <div class="clip-time-label">Akhir</div>
                                <input type="text" id="clip-end-time" value="0:00" readonly>
                            </div>
                        </div>

                        <div class="clip-timeline">
                            <div class="timeline-track">
                                <div class="timeline-progress" id="timeline-progress"></div>
                            </div>
                        </div>

                        <div class="music-controls-row">
                            <button class="music-control-btn" onclick="instagramNoteViewer.setClipStart()" title="Set sebagai awal klip">
                                ⏱ Mulai
                            </button>
                            <button class="music-control-btn" onclick="instagramNoteViewer.setClipEnd()" title="Set sebagai akhir klip">
                                ⏱ Akhir
                            </button>
                        </div>

                        <button class="music-play-btn" id="music-play-btn" onclick="instagramNoteViewer.togglePlay()">
                            ▶ Putar
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
                await this.initYoutubePlayer(noteData.youtubeId);
            } catch (error) {
                console.error('❌ Error initializing YouTube player:', error);
            }
        }

        // Fetch lyrics
        const lyrics = await this.fetchLyricsFromLRCLIB(
            noteData.songTitle || '',
            noteData.artistName || ''
        );

        this.lyrics = lyrics;

        if (lyrics.length === 0) {
            const container = document.getElementById('note-lyrics-container');
            if (container) {
                container.innerHTML = '<p class="no-lyrics-message">😔 Lirik tidak tersedia</p>';
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
