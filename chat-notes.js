// ===== INSTAGRAM-STYLE NOTES FEATURE WITH LYRICS =====

let viewingNoteUserId = null;
let notesUnsubscribe = null;
let currentLyrics = [];
let currentAudioIndex = 0;
let isAudioPlaying = false;

// Switch sidebar tab
window.switchSidebarTab = function(tab) {
    const tabPesan = document.getElementById('tabPesan');
    const tabNotes = document.getElementById('tabNotes');
    const panelPesan = document.getElementById('panelPesan');
    const panelNotes = document.getElementById('panelNotes');

    if (tab === 'pesan') {
        tabPesan.classList.add('active');
        tabNotes.classList.remove('active');
        panelPesan.style.display = 'flex';
        panelPesan.style.flexDirection = 'column';
        panelPesan.style.flex = '1';
        panelPesan.style.minHeight = '0';
        panelPesan.style.overflow = 'hidden';
        panelNotes.style.display = 'none';
    } else {
        tabPesan.classList.remove('active');
        tabNotes.classList.add('active');
        panelPesan.style.display = 'none';
        panelNotes.style.display = 'flex';
        loadNotesPanel();
    }
};

// Extract YouTube video ID
function extractYoutubeId(url) {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// Format time functions
function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Baru saja';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
}

function formatTimeLeft(expiresAt) {
    if (!expiresAt) return '';
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Kedaluwarsa';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `⏱ ${hours}j ${minutes}m lagi`;
    return `⏱ ${minutes}m lagi`;
}

// ===== LRCLIB API - FETCH LYRICS =====
async function fetchLyricsFromLRCLIB(artist, title) {
    try {
        const query = `${title} ${artist}`;
        const response = await fetch(
            `https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data.length === 0) return null;
        
        const track = data[0];
        
        // Get full lyrics
        const lyricsResponse = await fetch(
            `https://lrclib.net/api/get/${track.id}`
        );
        
        if (!lyricsResponse.ok) return null;
        
        const lyricsData = await lyricsResponse.json();
        
        // Parse synced lyrics if available
        if (lyricsData.syncedLyrics) {
            return parseSyncedLyrics(lyricsData.syncedLyrics);
        } else if (lyricsData.plainLyrics) {
            return lyricsData.plainLyrics.split('\n').filter(line => line.trim());
        }
        
        return null;
    } catch (error) {
        console.error('❌ Error fetching lyrics from LRCLIB:', error);
        return null;
    }
}

// Parse synced lyrics format [00:12.34]Lyric text
function parseSyncedLyrics(syncedLyrics) {
    const lines = syncedLyrics.split('\n');
    return lines
        .filter(line => line.match(/^\[[\d:\.]+\]/))
        .map(line => {
            const timeMatch = line.match(/\[([\d:\.]+)\]/);
            const text = line.replace(/^\[[\d:\.]+\]/, '');
            const [minutes, seconds] = timeMatch[1].split(':').map(parseFloat);
            const timestamp = minutes * 60 + seconds;
            return {
                time: timestamp,
                text: text,
                display: text
            };
        });
}

// ===== GENIUS API - METADATA (Optional) =====
async function fetchSongMetadata(songTitle, artistName) {
    // Note: Genius requires auth token, implement if needed
    // For now, return basic info
    return {
        title: songTitle,
        artist: artistName
    };
}

// Open Note Edit Modal
window.openNoteModal = function() {
    if (!currentUser) return;
    
    const noteModal = document.getElementById('noteModal');
    if (!noteModal) {
        console.error('❌ Note modal not found');
        return;
    }
    
    noteModal.style.display = 'flex';

    // Load existing note
    get(ref(database, `notes/${currentUser.uid}`)).then(snap => {
        if (snap.exists()) {
            const data = snap.val();
            document.getElementById('noteTextInput').value = data.text || '';
            document.getElementById('noteCharCount').textContent = `${(data.text||'').length}/60`;
            document.getElementById('noteYoutubeInput').value = data.youtubeUrl || '';
            if (data.youtubeUrl) previewYoutube(data.youtubeUrl);
        }
    }).catch(err => console.error('Error loading note:', err));

    document.getElementById('noteTextInput').oninput = function() {
        document.getElementById('noteCharCount').textContent = `${this.value.length}/60`;
    };
};

window.closeNoteModal = function() {
    const noteModal = document.getElementById('noteModal');
    if (noteModal) {
        noteModal.style.display = 'none';
    }
    const preview = document.getElementById('noteYoutubePreview');
    if (preview) {
        preview.style.display = 'none';
    }
};

window.previewYoutube = function(urlOverride) {
    const url = urlOverride || document.getElementById('noteYoutubeInput').value.trim();
    const videoId = extractYoutubeId(url);
    if (!videoId) {
        if (!urlOverride) alert('⚠️ Link YouTube tidak valid');
        return;
    }
    document.getElementById('noteYoutubePreview').style.display = 'block';
    document.getElementById('noteYoutubeTitle').textContent = 'Link valid ✓';
};

window.saveMyNote = async function() {
    if (!currentUser) return;
    const text = document.getElementById('noteTextInput').value.trim();
    const youtubeUrl = document.getElementById('noteYoutubeInput').value.trim();

    if (!text && !youtubeUrl) {
        alert('⚠️ Isi catatan atau tambahkan lagu YouTube!');
        return;
    }

    const videoId = extractYoutubeId(youtubeUrl);
    
    // Fetch lyrics if YouTube URL provided
    let lyrics = null;
    let songMetadata = null;
    
    if (videoId) {
        try {
            // Parse song info from YouTube title (basic approach)
            // You can enhance this with better metadata extraction
            songMetadata = {
                title: text || 'Lagu Favorit',
                artist: 'Unknown Artist'
            };
            
            // Fetch lyrics from LRCLIB
            lyrics = await fetchLyricsFromLRCLIB(songMetadata.artist, songMetadata.title);
        } catch (error) {
            console.error('Error fetching lyrics:', error);
        }
    }

    const now = Date.now();
    const noteData = {
        text: text,
        youtubeUrl: youtubeUrl,
        youtubeId: videoId || null,
        lyrics: lyrics || [],
        metadata: songMetadata || {},
        userId: currentUser.uid,
        userName: currentUserName,
        userPhoto: currentUserPhoto,
        updatedAt: now,
        expiresAt: now + 24 * 60 * 60 * 1000, // 24 jam
        likes: {},
        replies: {}
    };

    try {
        await set(ref(database, `notes/${currentUser.uid}`), noteData);
        closeNoteModal();
        renderMyNote(noteData);
        loadNotesPanel();
        alert('✅ Catatan berhasil disimpan!');
    } catch (err) {
        alert('❌ Gagal menyimpan: ' + err.message);
        console.error('Error saving note:', err);
    }
};

window.deleteMyNote = async function() {
    if (!currentUser) return;
    if (!confirm('Hapus catatan ini?')) return;
    try {
        await set(ref(database, `notes/${currentUser.uid}`), null);
        closeNoteModal();
        renderMyNote(null);
        loadNotesPanel();
    } catch (err) {
        alert('❌ Gagal hapus: ' + err.message);
    }
};

function renderMyNote(data) {
    const avatar = document.getElementById('myAvatar');
    const noteAvatar = document.getElementById('noteMyAvatar');
    if (noteAvatar && avatar) {
        noteAvatar.src = avatar.src;
    }
    document.getElementById('noteMyName').textContent = 'Kamu';

    const bubble = document.getElementById('myNoteBubble');
    const storyItem = document.getElementById('myNoteStoryItem');

    if (!data || (!data.text && !data.youtubeId)) {
        bubble.innerHTML = '<span class="note-bubble-empty">+ Catatan</span>';
        storyItem.classList.remove('has-note');
        return;
    }

    storyItem.classList.add('has-note');
    let bubbleContent = '';
    if (data.youtubeId) {
        bubbleContent += `<span class="note-bubble-music">🎵 ${escapeHtml(data.text || 'Lagu')}</span>`;
    } else if (data.text) {
        bubbleContent += `<span class="note-bubble-text">${escapeHtml(data.text)}</span>`;
    }
    bubble.innerHTML = bubbleContent;
}

function loadNotesPanel() {
    if (!currentUser) return;

    // Load own note
    get(ref(database, `notes/${currentUser.uid}`)).then(snap => {
        if (snap.exists()) {
            const myNote = snap.val();
            if (myNote.expiresAt && Date.now() > myNote.expiresAt) {
                set(ref(database, `notes/${currentUser.uid}`), null)
                    .then(() => renderMyNote(null))
                    .catch(err => console.error('Error deleting expired note:', err));
            } else {
                renderMyNote(myNote);
            }
        } else {
            renderMyNote(null);
        }
    }).catch(err => console.error('Error loading my note:', err));

    // Listen to all notes
    if (notesUnsubscribe) notesUnsubscribe();
    const notesRef = ref(database, 'notes');
    notesUnsubscribe = onValue(notesRef, (snap) => {
        const friendsList = document.getElementById('friendsNotesList');
        if (!friendsList) return;
        
        friendsList.innerHTML = '';

        const scrollRow = document.getElementById('notesScrollRow');
        const myItem = document.getElementById('myNoteStoryItem');
        if (scrollRow && myItem) {
            scrollRow.innerHTML = '';
            scrollRow.appendChild(myItem);
        }

        if (!snap.exists()) {
            friendsList.innerHTML = '<p class="notes-loading">Belum ada catatan teman</p>';
            return;
        }

        const now = Date.now();
        let count = 0;
        snap.forEach(child => {
            if (child.key === currentUser.uid) return;
            const note = child.val();
            if (!note || (!note.text && !note.youtubeId)) return;

            if (note.expiresAt && now > note.expiresAt) {
                set(ref(database, `notes/${child.key}`), null).catch(() => {});
                return;
            }

            count++;
            const likeCount = note.likes ? Object.keys(note.likes).length : 0;
            const replyCount = note.replies ? Object.keys(note.replies).length : 0;
            const liked = note.likes && note.likes[currentUser.uid];
            const hasMusic = !!note.youtubeId;

            // Story bubble in scroll row
            const storyItem = document.createElement('div');
            storyItem.className = 'note-story-item has-note';
            storyItem.setAttribute('data-user-id', child.key);
            storyItem.onclick = () => openNoteViewer(child.key);

            const bubbleText = hasMusic
                ? `<span class="note-bubble-music">🎵 ${escapeHtml(note.text || 'Lagu')}</span>`
                : `<span class="note-bubble-text">${escapeHtml(note.text || '')}</span>`;

            storyItem.innerHTML = `
                <div class="note-bubble friend-note-bubble">${bubbleText}</div>
                <div class="note-story-avatar-wrap">
                    ${hasMusic ? '<div class="note-music-ring"></div>' : ''}
                    <img src="${note.userPhoto || 'https://via.placeholder.com/64'}" class="note-story-avatar">
                </div>
                <div class="note-story-name">${escapeHtml((note.userName || 'User').split(' ')[0])}</div>
            `;
            if (scrollRow) {
                scrollRow.appendChild(storyItem);
            }

            // Card in list below
            const card = document.createElement('div');
            card.className = 'friend-note-card';
            card.setAttribute('data-user-id', child.key);
            
            let musicCardHtml = '';
            if (hasMusic && note.metadata) {
                musicCardHtml = `
                    <div class="friend-note-music-card" onclick="openNoteViewer('${child.key}')">
                        <div class="music-card-header">
                            <div class="music-icon">🎵</div>
                            <div class="music-card-info">
                                <div class="music-title">${escapeHtml(note.metadata.title || 'Lagu')}</div>
                                <div class="music-artist">${escapeHtml(note.metadata.artist || 'Unknown')}</div>
                            </div>
                        </div>
                        ${note.lyrics && note.lyrics.length > 0 ? `
                            <div class="lyrics-display-container">
                                <div class="lyrics-text">${escapeHtml(note.lyrics[0]?.text || '')}</div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }

            let textHtml = '';
            if (note.text) {
                textHtml = `<div class="friend-note-text" onclick="openNoteViewer('${child.key}')">${escapeHtml(note.text)}</div>`;
            }

            card.innerHTML = `
                <div class="friend-note-top" onclick="openNoteViewer('${child.key}')">
                    <div class="friend-note-avatar-wrap">
                        <img src="${note.userPhoto || 'https://via.placeholder.com/48'}" class="note-avatar">
                        ${hasMusic ? '<div class="note-music-ring"></div>' : ''}
                    </div>
                    <div class="friend-note-info">
                        <div class="note-username">${escapeHtml(note.userName || 'User')}</div>
                        <div class="note-sub">
                            <span>${formatTimeAgo(note.updatedAt)}</span>
                            <span>•</span>
                            <span class="note-expires">${formatTimeLeft(note.expiresAt)}</span>
                        </div>
                    </div>
                </div>
                ${musicCardHtml}
                ${textHtml}
                <div class="friend-note-actions">
                    <button class="note-action-btn ${liked ? 'liked' : ''}" onclick="quickLikeNote('${child.key}', event)">
                        ${liked ? '❤️' : '🤍'} ${likeCount}
                    </button>
                    <button class="note-action-btn" onclick="openNoteViewer('${child.key}')">
                        💬 ${replyCount}
                    </button>
                </div>
            `;
            friendsList.appendChild(card);
        });

        if (count === 0) {
            friendsList.innerHTML = '<p class="notes-loading">Belum ada catatan teman</p>';
        }
    }, (error) => {
        console.error('Error loading notes:', error);
    });
}

window.quickLikeNote = async function(userId, event) {
    event.stopPropagation();
    if (!currentUser) return;
    try {
        const likeRef = ref(database, `notes/${userId}/likes/${currentUser.uid}`);
        const snap = await get(likeRef);
        if (snap.exists()) {
            await set(likeRef, null);
        } else {
            await set(likeRef, true);
        }
        loadNotesPanel();
    } catch (err) {
        console.error('Error toggling like:', err);
    }
};

window.openNoteViewer = function(userId) {
    viewingNoteUserId = userId;
    isAudioPlaying = false;
    currentAudioIndex = 0;
    
    get(ref(database, `notes/${userId}`)).then(snap => {
        if (!snap.exists()) return;
        const note = snap.val();

        // Create modal content
        const modal = document.getElementById('noteViewerModal');
        const header = document.querySelector('.note-viewer-header');
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'note-viewer-content-wrapper';

        // Header
        header.innerHTML = `
            <img src="${note.userPhoto || 'https://via.placeholder.com/52'}" class="note-viewer-avatar">
            <div>
                <div class="note-viewer-name">${escapeHtml(note.userName || 'User')}</div>
                <div class="note-viewer-time">${formatTimeAgo(note.updatedAt)}</div>
            </div>
            <button class="modal-close" style="margin-left: auto;" onclick="closeNoteViewer()">✕</button>
        `;

        // Content
        let content = '';

        // Music Player if YouTube
        if (note.youtubeId && note.metadata) {
            content += `
                <div class="viewer-music-player">
                    <div class="player-header">
                        <div class="player-music-icon" id="playerMusicIcon">🎵</div>
                        <div class="player-info">
                            <div class="player-title">${escapeHtml(note.metadata.title || 'Lagu')}</div>
                            <div class="player-artist">${escapeHtml(note.metadata.artist || 'Unknown')}</div>
                        </div>
                        <div class="player-controls">
                            <button class="player-play-btn" id="playerPlayBtn" onclick="toggleNoteAudio('${note.youtubeId}')">▶</button>
                        </div>
                    </div>
                </div>
            `;
        }

        // Text content
        if (note.text && !note.youtubeId) {
            content += `
                <div style="background: linear-gradient(135deg, #1a2d4a 0%, #0f1f35 100%); border-left: 3px solid #3b82f6; padding: 14px; border-radius: 0 8px 8px 0;">
                    <div style="color: #e0e6ed; font-size: 1rem; line-height: 1.6;">${escapeHtml(note.text)}</div>
                </div>
            `;
        }

        // Lyrics
        if (note.lyrics && note.lyrics.length > 0) {
            content += `
                <div class="viewer-lyrics-container">
                    <div class="lyrics-title">🎤 Lirik</div>
                    <div class="lyrics-lines">
                        ${note.lyrics.map((line, idx) => `
                            <div class="lyric-line" data-index="${idx}">
                                ${escapeHtml(typeof line === 'string' ? line : line.text || line.display)}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        contentWrapper.innerHTML = content;

        // Update modal
        const existingWrapper = modal.querySelector('.note-viewer-content-wrapper');
        if (existingWrapper) {
            existingWrapper.replaceWith(contentWrapper);
        } else {
            modal.appendChild(contentWrapper);
        }

        // Reactions
        const likes = note.likes || {};
        const likeCount = Object.keys(likes).length;
        const liked = likes[currentUser.uid];
        const replyCount = Object.keys(note.replies || {}).length;

        // Update reactions (at bottom)
        const reactionsHtml = `
            <div class="note-viewer-reactions">
                <button class="reaction-btn ${liked ? 'liked' : ''}" onclick="toggleLikeNote()">
                    ${liked ? '❤️' : '🤍'} <span id="likeCountDisplay">${likeCount}</span>
                </button>
                <button class="reaction-btn" onclick="focusReply()">
                    💬 <span id="replyCountDisplay">${replyCount}</span>
                </button>
            </div>
        `;

        const existingReactions = modal.querySelector('.note-viewer-reactions');
        if (existingReactions) {
            existingReactions.innerHTML = reactionsHtml;
        }

        modal.style.display = 'flex';
    }).catch(err => console.error('Error opening note viewer:', err));
};

window.toggleNoteAudio = function(youtubeId) {
    const btn = document.getElementById('playerPlayBtn');
    const icon = document.getElementById('playerMusicIcon');
    
    if (!isAudioPlaying) {
        btn.textContent = '⏸';
        icon.classList.add('playing');
        isAudioPlaying = true;
    } else {
        btn.textContent = '▶';
        icon.classList.remove('playing');
        isAudioPlaying = false;
    }
};

window.closeNoteViewer = function() {
    const modal = document.getElementById('noteViewerModal');
    if (modal) {
        modal.style.display = 'none';
    }
    viewingNoteUserId = null;
    isAudioPlaying = false;
};

window.toggleLikeNote = async function() {
    if (!currentUser || !viewingNoteUserId) return;
    try {
        const likeRef = ref(database, `notes/${viewingNoteUserId}/likes/${currentUser.uid}`);
        const snap = await get(likeRef);
        if (snap.exists()) {
            await set(likeRef, null);
        } else {
            await set(likeRef, true);
        }
        // Refresh viewer
        openNoteViewer(viewingNoteUserId);
    } catch (err) {
        console.error('Error toggling like:', err);
    }
};

window.focusReply = function() {
    document.getElementById('replyInput').focus();
};

window.handleReplyEnter = function(event) {
    if (event.key === 'Enter') sendReply();
};

window.sendReply = async function() {
    if (!currentUser || !viewingNoteUserId) return;
    const input = document.getElementById('replyInput');
    const text = input.value.trim();
    if (!text) return;

    const replyData = {
        userId: currentUser.uid,
        userName: currentUserName,
        userPhoto: currentUserPhoto,
        text: text,
        timestamp: Date.now()
    };

    try {
        await push(ref(database, `notes/${viewingNoteUserId}/replies`), replyData);
        input.value = '';
        openNoteViewer(viewingNoteUserId);
    } catch (err) {
        alert('❌ Gagal kirim balasan: ' + err.message);
    }
};
